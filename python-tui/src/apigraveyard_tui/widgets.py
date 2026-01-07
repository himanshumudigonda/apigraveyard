"""
Custom Textual widgets for APIgraveyard TUI.
"""

from textual.app import ComposeResult
from textual.containers import Container, Horizontal, Vertical, VerticalScroll
from textual.widget import Widget
from textual.widgets import Static, Button, Input, DataTable, Label, ProgressBar, Markdown
from textual.reactive import reactive
from textual.message import Message
from textual.binding import Binding
from rich.text import Text
from rich.panel import Panel
from rich.console import RenderableType

from .scanner import APIKeyMatch, get_service_emoji
from .tester import get_status_emoji, get_status_color


class Header(Static):
    """Custom header with ASCII art logo."""
    
    LOGO = """[bold magenta]
    ___    ____  ____                                                __
   /   |  / __ \\/  _/___ __________ __   _____  __  ______ __________/ /
  / /| | / /_/ // // __ `/ ___/ __ `/ | / / _ \\/ / / / __ `/ ___/ __  / 
 / ___ |/ ____// // /_/ / /  / /_/ /| |/ /  __/ /_/ / /_/ / /  / /_/ /  
/_/  |_/_/   /___/\\__, /_/   \\__,_/ |___/\\___/\\__, /\\__,_/_/   \\__,_/   
                 /____/                      /____/                     
[/bold magenta][dim]                                                    🪦 RIP APIs 🪦[/dim]"""

    def compose(self) -> ComposeResult:
        yield Static(self.LOGO, id="logo")


class StatusBar(Static):
    """Status bar showing current state."""
    
    status = reactive("Ready")
    project_count = reactive(0)
    key_count = reactive(0)
    
    def render(self) -> RenderableType:
        return Text.from_markup(
            f"[bold cyan]📁 {self.project_count}[/] projects  "
            f"[bold yellow]🔑 {self.key_count}[/] keys  "
            f"[dim]│[/]  "
            f"[green]{self.status}[/]"
        )


class KeyCard(Static):
    """A card displaying an API key."""
    
    def __init__(
        self,
        key_match: APIKeyMatch,
        index: int = 0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.key_match = key_match
        self.index = index
    
    def render(self) -> RenderableType:
        k = self.key_match
        emoji = get_service_emoji(k.service)
        status_emoji = get_status_emoji(k.status)
        status_color = get_status_color(k.status)
        
        content = Text()
        content.append(f"{emoji} ", style="bold")
        content.append(f"{k.service}\n", style="bold cyan")
        content.append(f"   Key: ", style="dim")
        content.append(f"{k.masked_key}\n", style="yellow")
        content.append(f"   File: ", style="dim")
        content.append(f"{k.file_path}:{k.line_number}\n", style="blue")
        content.append(f"   Status: ", style="dim")
        content.append(f"{status_emoji} {k.status}", style=status_color)
        if k.details:
            content.append(f" ({k.details})", style="dim")
        
        return Panel(
            content,
            title=f"[bold]Key #{self.index + 1}[/]",
            border_style="cyan" if k.status == "VALID" else "yellow" if k.status == "UNTESTED" else "red",
        )


class KeyList(VerticalScroll):
    """Scrollable list of API keys."""
    
    keys: reactive[list[APIKeyMatch]] = reactive(list)
    
    def compose(self) -> ComposeResult:
        if not self.keys:
            yield Static(
                "[dim]No API keys found. Scan a project to get started.[/]",
                id="empty-message"
            )
    
    def watch_keys(self, keys: list[APIKeyMatch]) -> None:
        """React to keys changing."""
        self.remove_children()
        if not keys:
            self.mount(Static(
                "[dim]No API keys found. Scan a project to get started.[/]",
                id="empty-message"
            ))
        else:
            for i, key in enumerate(keys):
                self.mount(KeyCard(key, index=i))


class ScanProgress(Static):
    """Progress indicator for scanning."""
    
    files_scanned = reactive(0)
    current_file = reactive("")
    is_scanning = reactive(False)
    
    def render(self) -> RenderableType:
        if not self.is_scanning:
            return Text()
        
        return Text.from_markup(
            f"[bold cyan]🔍 Scanning...[/]  "
            f"[yellow]{self.files_scanned}[/] files  "
            f"[dim]{self.current_file[:40]}...[/]"
        )


class ProjectCard(Static):
    """A card for a project in the list."""
    
    class Selected(Message):
        """Project was selected."""
        def __init__(self, path: str) -> None:
            self.path = path
            super().__init__()
    
    def __init__(self, name: str, path: str, key_count: int, valid_count: int, last_scanned: str, **kwargs):
        super().__init__(**kwargs)
        self.project_name = name
        self.project_path = path
        self.key_count = key_count
        self.valid_count = valid_count
        self.last_scanned = last_scanned
    
    def render(self) -> RenderableType:
        content = Text()
        content.append(f"📁 {self.project_name}\n", style="bold cyan")
        content.append(f"   {self.project_path}\n", style="dim")
        content.append(f"   🔑 {self.key_count} keys ", style="yellow")
        content.append(f"({self.valid_count} valid)\n", style="green")
        content.append(f"   Last: {self.last_scanned[:10]}", style="dim")
        
        return Panel(content, border_style="blue")
    
    async def on_click(self) -> None:
        self.post_message(self.Selected(self.project_path))


class ChatMessage(Static):
    """A single chat message."""
    
    def __init__(self, role: str, content: str, **kwargs):
        super().__init__(**kwargs)
        self.role = role
        self.message_content = content
    
    def render(self) -> RenderableType:
        if self.role == "user":
            return Panel(
                Text(self.message_content, style="white"),
                title="[bold blue]You[/]",
                border_style="blue",
            )
        else:
            return Panel(
                Text(self.message_content, style="green"),
                title="[bold green]🤖 AI[/]",
                border_style="green",
            )


class ChatBubble(Container):
    """Floating AI chat bubble widget."""
    
    is_open = reactive(False)
    is_loading = reactive(False)
    
    BINDINGS = [
        Binding("escape", "close", "Close chat"),
    ]
    
    class SendMessage(Message):
        """User wants to send a message."""
        def __init__(self, message: str) -> None:
            self.message = message
            super().__init__()
    
    def compose(self) -> ComposeResult:
        with Container(id="chat-container"):
            yield Static(
                "[bold magenta]🪦 AI Assistant[/] [dim](Groq)[/]",
                id="chat-header"
            )
            yield VerticalScroll(id="chat-messages")
            with Horizontal(id="chat-input-row"):
                yield Input(placeholder="Ask me anything...", id="chat-input")
                yield Button("Send", id="chat-send", variant="primary")
    
    def add_message(self, role: str, content: str) -> None:
        """Add a message to the chat."""
        messages = self.query_one("#chat-messages", VerticalScroll)
        messages.mount(ChatMessage(role, content))
        messages.scroll_end(animate=False)
    
    def clear_messages(self) -> None:
        """Clear all messages."""
        messages = self.query_one("#chat-messages", VerticalScroll)
        messages.remove_children()
    
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "chat-send":
            await self._send_message()
    
    async def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id == "chat-input":
            await self._send_message()
    
    async def _send_message(self) -> None:
        input_widget = self.query_one("#chat-input", Input)
        message = input_widget.value.strip()
        if message:
            input_widget.value = ""
            self.post_message(self.SendMessage(message))
    
    def action_close(self) -> None:
        self.is_open = False
    
    def watch_is_open(self, is_open: bool) -> None:
        if is_open:
            self.add_class("open")
            self.query_one("#chat-input", Input).focus()
        else:
            self.remove_class("open")


class SidePanel(Container):
    """Side panel with navigation and actions."""
    
    def compose(self) -> ComposeResult:
        yield Static("[bold]🪦 Menu[/]", id="menu-title")
        yield Button("📂 Scan Project", id="btn-scan", variant="primary")
        yield Button("🧪 Test Keys", id="btn-test", variant="warning")
        yield Button("📋 List Projects", id="btn-list", variant="default")
        yield Button("📊 Statistics", id="btn-stats", variant="default")
        yield Button("💾 Export", id="btn-export", variant="default")
        yield Button("🧹 Clean", id="btn-clean", variant="default")
        yield Static("", id="spacer")
        yield Button("💬 AI Chat", id="btn-chat", variant="success")
        yield Button("⚙️ Settings", id="btn-settings", variant="default")


class MainContent(Container):
    """Main content area."""
    
    def compose(self) -> ComposeResult:
        yield Static("[bold cyan]Welcome to APIgraveyard[/]\n\n[dim]Select an action from the menu to get started.[/]", id="welcome")


class StatsPanel(Static):
    """Statistics display panel."""
    
    def __init__(self, stats: dict, **kwargs):
        super().__init__(**kwargs)
        self.stats = stats
    
    def render(self) -> RenderableType:
        s = self.stats
        content = Text()
        content.append("📊 Database Statistics\n\n", style="bold cyan")
        content.append(f"  📁 Projects: ", style="dim")
        content.append(f"{s.get('total_projects', 0)}\n", style="yellow")
        content.append(f"  🔑 Total Keys: ", style="dim")
        content.append(f"{s.get('total_keys', 0)}\n", style="yellow")
        content.append(f"  ✅ Valid: ", style="dim")
        content.append(f"{s.get('valid_keys', 0)}\n", style="green")
        content.append(f"  ❌ Invalid: ", style="dim")
        content.append(f"{s.get('invalid_keys', 0)}\n", style="red")
        content.append(f"  ❓ Untested: ", style="dim")
        content.append(f"{s.get('untested_keys', 0)}\n", style="yellow")
        content.append(f"  🚫 Banned: ", style="dim")
        content.append(f"{s.get('banned_keys', 0)}\n\n", style="red")
        
        if s.get("services"):
            content.append("Services:\n", style="bold")
            for service, count in s["services"].items():
                content.append(f"  {get_service_emoji(service)} {service}: ", style="dim")
                content.append(f"{count}\n", style="cyan")
        
        return Panel(content, border_style="cyan")
