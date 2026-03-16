#!/bin/bash
# Cross-platform native notification
# Usage: notify.sh "title" "message"
# Always exits 0 — notifications are best-effort, never block

TITLE="${1:-Claude Code}"
MESSAGE="${2:-Task completed}"

case "$(uname -s)" in
    Darwin)
        # Pass title and message as arguments to avoid shell injection
        osascript \
            -e 'on run argv' \
            -e 'display notification (item 2 of argv) with title (item 1 of argv)' \
            -e 'end run' \
            -- "$TITLE" "$MESSAGE" 2>/dev/null
        ;;
    Linux)
        if command -v notify-send &>/dev/null; then
            notify-send "$TITLE" "$MESSAGE" 2>/dev/null
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Windows: PowerShell toast notification
        # Note: -Command mode doesn't support param() with positional args,
        # so we inline the values. Safe because messages are hardcoded constants from hooks.
        MSYS_NO_PATHCONV=1 powershell.exe -Command "
            try {
                \$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
                \$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02
                \$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(\$template)
                \$text = \$xml.GetElementsByTagName('text')
                \$text[0].AppendChild(\$xml.CreateTextNode('$TITLE')) | Out-Null
                \$text[1].AppendChild(\$xml.CreateTextNode('$MESSAGE')) | Out-Null
                \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$xml)
                [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show(\$toast)
            } catch {}
        " 2>/dev/null
        ;;
esac

exit 0
