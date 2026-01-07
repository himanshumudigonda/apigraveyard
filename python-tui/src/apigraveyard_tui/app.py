"""
APIgraveyard TUI - Main Application
A beautiful terminal UI for finding dead APIs haunting your codebase.
"""

import asyncio
from pathlib import Path

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical, VerticalScroll
from textual.widgets import (
    Static, Button, Input, DataTable, Label, 
    ProgressBar, Footer, Header as TextualHeader, TabbedContent, TabPane,
    DirectoryTree, RichLog, LoadingIndicator,
)
from textual.binding import Binding
from textual.screen import Screen, ModalScreen
from textual.reactive import reactive
from rich.text import Text

from . import __version__
from .scanner import scan_directory, quick_scan, APIKeyMatch, get_service_emoji, mask_key
from .tester import test_keys, test_key, get_status_emoji, get_status_color
from .database import (
    load_database, save_database, add_project, get_all_projects,
    get_stats, set_groq_api_key, get_groq_api_key, 
    Project, StoredKey, match_to_stored,
)
from .ai_chat import get_chat_client, GROQ_MODELS


# ASCII Logo
LOGO = """[bold yellow]
   ___    ____  ____                                                __
  /   |  / __ \\/  _/___ __________ __   _____  __  ______ __________/ /
 / /| | / /_/ // // __ `/ ___/ __ `/ | / / _ \\/ / / / __ `/ ___/ __  / 
/ ___ |/ ____// // /_/ / /  / /_/ /| |/ /  __/ /_/ / /_/ / /  / /_/ /  
/_/  |_/_/   /___\\__, /_/   \\__,_/ |___/\\___/\\__, /\\__,_/_/   \\__,_/   
                /____/                      /____/  [dim]v{version}[/dim]
[/bold yellow][dim]                                                   🪦 RIP APIs 🪦[/dim]""".format(version=__version__)


class SettingsScreen(ModalScreen[bool]):
    """Settings modal screen."""
    
    BINDINGS = [
        Binding("escape", "cancel", "Cancel"),
    ]
    
    def compose(self) -> ComposeResult:
        yield Container(
            Static("[bold]⚙️ Settings[/]", id="settings-title"),
            Static("\n[bold cyan]Groq API Key[/]"),
            Static("[dim]Required for AI chat assistant. Get one at console.groq.com[/]"),
            Input(placeholder="gsk_...", id="groq-key-input", password=True),
            Static(""),
            Horizontal(
                Button("Save", id="save-btn", variant="primary"),
                Button("Cancel", id="cancel-btn", variant="default"),
                id="settings-buttons"
            ),
            id="settings-container"
        )
    
    async def on_mount(self) -> None:
        # Load existing key
        key = await get_groq_api_key()
        if key:
            self.query_one("#groq-key-input", Input).value = key
    
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "save-btn":
            key = self.query_one("#groq-key-input", Input).value.strip()
            await set_groq_api_key(key if key else None)
            if key:
                get_chat_client().set_api_key(key)
            self.dismiss(True)
        else:
            self.dismiss(False)
    
    def action_cancel(self) -> None:
        self.dismiss(False)


class ScanScreen(ModalScreen[str | None]):
    """Scan directory modal."""
    
    BINDINGS = [
        Binding("escape", "cancel", "Cancel"),
    ]
    
    def compose(self) -> ComposeResult:
        yield Container(
            Static("[bold]📂 Scan Project for API Keys[/]", id="scan-title"),
            Static("\n[dim]Enter the path to scan:[/]"),
            Input(placeholder="/path/to/project", id="path-input"),
            Static(""),
            Horizontal(
                Button("Scan", id="scan-btn", variant="primary"),
                Button("Cancel", id="cancel-btn", variant="default"),
                id="scan-buttons"
            ),
            id="scan-container"
        )
    
    async def on_mount(self) -> None:
        # Default to current directory
        self.query_one("#path-input", Input).value = str(Path.cwd())
    
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "scan-btn":
            path = self.query_one("#path-input", Input).value.strip()
            if path and Path(path).exists():
                self.dismiss(path)
            else:
                self.notify("Invalid path!", severity="error")
        else:
            self.dismiss(None)
    
    async def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "path-input":
            path = event.value.strip()
            if path and Path(path).exists():
                self.dismiss(path)
    
    def action_cancel(self) -> None:
        self.dismiss(None)


class APIgraveyardApp(App):
    """Main APIgraveyard TUI Application."""
    
    TITLE = "APIgraveyard"
    SUB_TITLE = "Find the dead APIs haunting your codebase"
    CSS_PATH = "styles.tcss"
    
    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("s", "scan", "Scan"),
        Binding("t", "test", "Test Keys"),
        Binding("l", "list_projects", "List"),
        Binding("c", "toggle_chat", "Chat"),
        Binding("?", "help", "Help"),
        Binding("ctrl+s", "settings", "Settings"),
    ]
    
    # Reactive state
    current_keys: reactive[list[APIKeyMatch]] = reactive(list)
    is_scanning: reactive[bool] = reactive(False)
    chat_visible: reactive[bool] = reactive(False)
    
    def compose(self) -> ComposeResult:
        yield TextualHeader()
        
        with Container(id="app-container"):
            # Sidebar
            with Container(id="sidebar"):
                yield Static(LOGO, id="logo")
                yield Static("")
                yield Button("📂 Scan Project", id="btn-scan", variant="primary", classes="nav-btn")
                yield Button("🧪 Test Keys", id="btn-test", variant="warning", classes="nav-btn")
                yield Button("📋 Projects", id="btn-projects", classes="nav-btn")
                yield Button("📊 Statistics", id="btn-stats", classes="nav-btn")
                yield Button("💾 Export", id="btn-export", classes="nav-btn")
                yield Static("")
                yield Button("💬 AI Chat", id="btn-chat", variant="success", classes="nav-btn")
                yield Button("⚙️ Settings", id="btn-settings", classes="nav-btn")
            
            # Main content
            with Container(id="main"):
                with TabbedContent(id="tabs"):
                    with TabPane("🏠 Dashboard", id="tab-dashboard"):
                        yield Container(id="dashboard-content")
                    
                    with TabPane("🔑 Keys", id="tab-keys"):
                        yield DataTable(id="keys-table")
                    
                    with TabPane("📁 Projects", id="tab-projects"):
                        yield VerticalScroll(id="projects-list")
                    
                    with TabPane("📊 Stats", id="tab-stats"):
                        yield Container(id="stats-content")
                
                # Floating chat bubble
                with Container(id="chat-bubble", classes="-hidden"):
                    yield Static("[bold magenta]🪦 AI Assistant[/] [dim]powered by Groq[/]", id="chat-header")
                    yield VerticalScroll(id="chat-messages")
                    with Horizontal(id="chat-input-row"):
                        yield Input(placeholder="Ask me anything about API security...", id="chat-input")
                        yield Button("→", id="chat-send", variant="primary")
        
        yield Footer()
    
    async def on_mount(self) -> None:
        """Called when app starts."""
        # Load Groq API key
        key = await get_groq_api_key()
        if key:
            get_chat_client().set_api_key(key)
        
        # Setup keys table
        table = self.query_one("#keys-table", DataTable)
        table.add_columns("Service", "Key", "File", "Line", "Status", "Details")
        table.cursor_type = "row"
        
        # Load dashboard
        await self._update_dashboard()
        await self._update_projects_list()
        
        # Welcome message in chat
        chat = self.query_one("#chat-messages", VerticalScroll)
        chat.mount(Static(
            "[bold green]🤖 AI Assistant[/]\n"
            "[dim]I can help you with API security questions, "
            "explain what different keys do, and more.\n\n"
            f"Using: {get_chat_client().current_model}[/]"
        ))
    
    async def _update_dashboard(self) -> None:
        """Update the dashboard content."""
        stats = await get_stats()
        dashboard = self.query_one("#dashboard-content", Container)
        dashboard.remove_children()
        
        # Stats cards
        dashboard.mount(Static(
            f"[bold cyan]📊 Overview[/]\n\n"
            f"  📁 [bold]{stats['total_projects']}[/] projects tracked\n"
            f"  🔑 [bold]{stats['total_keys']}[/] API keys found\n"
            f"  ✅ [bold green]{stats['valid_keys']}[/] valid keys\n"
            f"  ❌ [bold red]{stats['invalid_keys']}[/] invalid keys\n"
            f"  ❓ [bold yellow]{stats['untested_keys']}[/] untested keys\n"
            f"  🚫 [bold red]{stats['banned_keys']}[/] banned keys\n\n"
            f"[dim]Press 's' to scan a project, 't' to test keys, 'c' to chat with AI[/]"
        ))
    
    async def _update_projects_list(self) -> None:
        """Update the projects list."""
        projects = await get_all_projects()
        projects_list = self.query_one("#projects-list", VerticalScroll)
        projects_list.remove_children()
        
        if not projects:
            projects_list.mount(Static(
                "[dim]No projects scanned yet.\n"
                "Press 's' to scan your first project.[/]"
            ))
            return
        
        for project in projects:
            valid_count = sum(1 for k in project.keys if k.status == "VALID")
            projects_list.mount(Static(
                f"[bold cyan]📁 {project.name}[/]\n"
                f"   [dim]{project.path}[/]\n"
                f"   🔑 {len(project.keys)} keys ([green]{valid_count} valid[/])\n"
                f"   [dim]Last: {project.last_scanned[:16]}[/]\n"
            ))
    
    async def _update_stats(self) -> None:
        """Update the stats panel."""
        stats = await get_stats()
        stats_content = self.query_one("#stats-content", Container)
        stats_content.remove_children()
        
        content = (
            f"[bold cyan]📊 Database Statistics[/]\n\n"
            f"  📁 Projects: [yellow]{stats['total_projects']}[/]\n"
            f"  🔑 Total Keys: [yellow]{stats['total_keys']}[/]\n"
            f"  ✅ Valid: [green]{stats['valid_keys']}[/]\n"
            f"  ❌ Invalid: [red]{stats['invalid_keys']}[/]\n"
            f"  ❓ Untested: [yellow]{stats['untested_keys']}[/]\n"
            f"  🚫 Banned: [red]{stats['banned_keys']}[/]\n\n"
        )
        
        if stats.get("services"):
            content += "[bold]Services Breakdown:[/]\n"
            for service, count in stats["services"].items():
                emoji = get_service_emoji(service)
                content += f"  {emoji} {service}: [cyan]{count}[/]\n"
        
        content += f"\n[dim]Groq AI: {'✅ Configured' if stats.get('has_groq_key') else '❌ Not configured'}[/]"
        
        stats_content.mount(Static(content))
    
    async def _do_scan(self, path: str) -> None:
        """Perform a scan on the given path."""
        self.is_scanning = True
        self.notify(f"Scanning {path}...", title="🔍 Scanning")
        
        table = self.query_one("#keys-table", DataTable)
        table.clear()
        
        keys: list[APIKeyMatch] = []
        files_scanned = 0
        
        try:
            async for key in scan_directory(Path(path)):
                keys.append(key)
                emoji = get_service_emoji(key.service)
                status_emoji = get_status_emoji(key.status)
                table.add_row(
                    f"{emoji} {key.service}",
                    key.masked_key,
                    str(Path(key.file_path).name),
                    str(key.line_number),
                    f"{status_emoji} {key.status}",
                    key.details,
                )
            
            # Save to database
            project = Project(
                name=Path(path).name,
                path=str(path),
                keys=[match_to_stored(k) for k in keys],
                total_files=files_scanned,
            )
            await add_project(project)
            
            self.current_keys = keys
            self.notify(f"Found {len(keys)} API keys!", title="✅ Scan Complete", severity="information")
            
            # Switch to keys tab
            tabs = self.query_one("#tabs", TabbedContent)
            tabs.active = "tab-keys"
            
        except Exception as e:
            self.notify(f"Scan failed: {e}", title="❌ Error", severity="error")
        
        self.is_scanning = False
        await self._update_dashboard()
        await self._update_projects_list()
    
    async def _do_test(self) -> None:
        """Test all keys."""
        if not self.current_keys:
            self.notify("No keys to test. Scan a project first.", severity="warning")
            return
        
        self.notify("Testing keys...", title="🧪 Testing")
        
        table = self.query_one("#keys-table", DataTable)
        
        for i, key in enumerate(self.current_keys):
            result = await test_key(key)
            key.status = result.status
            key.details = result.details
            
            # Update table row
            emoji = get_service_emoji(key.service)
            status_emoji = get_status_emoji(result.status)
            
            # Update the row (column index for status is 4)
            table.update_cell_at((i, 4), f"{status_emoji} {result.status}")
            table.update_cell_at((i, 5), result.details)
            
            # Small delay for rate limiting
            await asyncio.sleep(0.5)
        
        self.notify("All keys tested!", title="✅ Done", severity="information")
    
    async def _send_chat_message(self, message: str) -> None:
        """Send a message to the AI chat."""
        chat_messages = self.query_one("#chat-messages", VerticalScroll)
        
        # Add user message
        chat_messages.mount(Static(f"[bold blue]You:[/] {message}"))
        chat_messages.scroll_end(animate=False)
        
        # Get AI response
        chat_messages.mount(Static("[dim]🤖 Thinking...[/]", id="thinking"))
        
        client = get_chat_client()
        response = await client.send_message(message)
        
        # Remove thinking indicator
        thinking = self.query_one("#thinking", Static)
        thinking.remove()
        
        # Add AI response
        chat_messages.mount(Static(
            f"[bold green]🤖 AI:[/] {response.content}\n"
            f"[dim]({response.model_used}, {response.tokens_used} tokens)[/]"
        ))
        chat_messages.scroll_end(animate=False)
    
    # Button handlers
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id
        
        if button_id == "btn-scan":
            await self.action_scan()
        elif button_id == "btn-test":
            await self.action_test()
        elif button_id == "btn-projects":
            await self.action_list_projects()
        elif button_id == "btn-stats":
            await self._update_stats()
            tabs = self.query_one("#tabs", TabbedContent)
            tabs.active = "tab-stats"
        elif button_id == "btn-chat":
            self.action_toggle_chat()
        elif button_id == "btn-settings":
            await self.action_settings()
        elif button_id == "btn-export":
            self.notify("Export feature coming soon!", severity="information")
        elif button_id == "chat-send":
            input_widget = self.query_one("#chat-input", Input)
            message = input_widget.value.strip()
            if message:
                input_widget.value = ""
                await self._send_chat_message(message)
    
    async def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "chat-input":
            message = event.value.strip()
            if message:
                event.input.value = ""
                await self._send_chat_message(message)
    
    # Actions
    async def action_scan(self) -> None:
        """Open scan dialog."""
        path = await self.push_screen_wait(ScanScreen())
        if path:
            await self._do_scan(path)
    
    async def action_test(self) -> None:
        """Test all keys."""
        await self._do_test()
    
    async def action_list_projects(self) -> None:
        """Show projects list."""
        await self._update_projects_list()
        tabs = self.query_one("#tabs", TabbedContent)
        tabs.active = "tab-projects"
    
    def action_toggle_chat(self) -> None:
        """Toggle the chat bubble visibility."""
        chat_bubble = self.query_one("#chat-bubble", Container)
        if chat_bubble.has_class("-hidden"):
            chat_bubble.remove_class("-hidden")
            self.query_one("#chat-input", Input).focus()
        else:
            chat_bubble.add_class("-hidden")
    
    async def action_settings(self) -> None:
        """Open settings."""
        result = await self.push_screen_wait(SettingsScreen())
        if result:
            self.notify("Settings saved!", severity="information")
    
    def action_help(self) -> None:
        """Show help."""
        self.notify(
            "s=Scan, t=Test, l=List, c=Chat, Ctrl+s=Settings, q=Quit",
            title="⌨️ Keyboard Shortcuts",
            timeout=5,
        )


def main():
    """Entry point for the TUI."""
    app = APIgraveyardApp()
    app.run()


if __name__ == "__main__":
    main()
