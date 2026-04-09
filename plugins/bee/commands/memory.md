---
description: View and manage user preferences stored in .bee/user.md
argument-hint: ""
---

# /bee:memory -- View & Manage User Preferences

Display and optionally edit the user preferences stored in `.bee/user.md`.

## Instructions

1. Check if `.bee/user.md` exists.

   **If it does not exist**, display:
   ```
   No user preferences file found (.bee/user.md).
   This file lets you set persistent preferences and context for all agents on this project.
   ```

   ```
   AskUserQuestion(
     question: "No .bee/user.md found. Create it now?",
     options: ["Yes, create it", "Custom"]
   )
   ```
   If "Yes, create it" is selected, create `.bee/user.md` with a short starter template and open it for editing. Stop here.

2. **If `.bee/user.md` exists**, read its contents and display them:

   ```
   ## User Preferences (.bee/user.md)

   {contents of .bee/user.md}
   ```

3. After displaying the contents:

   ```
   AskUserQuestion(
     question: "Edit your preferences?",
     options: ["Edit", "View only", "Custom"]
   )
   ```

4. If "Edit" is selected, open `.bee/user.md` for editing using the Edit tool so they can add or modify entries inline. Confirm the changes were saved.

## Notes

- `.bee/user.md` is injected into every agent session automatically, so changes take effect immediately on the next run.
- Typical entries include coding style preferences, project conventions, tool preferences, and anything else agents should always be aware of.
