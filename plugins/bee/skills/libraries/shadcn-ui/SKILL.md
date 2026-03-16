---
name: shadcn-ui
description: shadcn/ui component library conventions -- use when project has components.json or @/components/ui/ directory. Covers component usage, customization, theming, composition patterns, and common pitfalls.
---

# shadcn/ui Standards

These standards apply when the project uses shadcn/ui. **Detection:** check for `components.json` at project root OR `@/components/ui/` directory with shadcn component files. If neither exists, this skill does not apply.

**Also read the active stack skill** (react, vue, nextjs, etc.) for framework-specific conventions. This skill covers shadcn-specific patterns only.

## Core Architecture

### How shadcn/ui Works

shadcn/ui is NOT a dependency — it's a **code distribution platform**. Components are copied into your project and become YOUR code. This means:

- Components live in `@/components/ui/` (or wherever `aliases.ui` points in `components.json`)
- You OWN the code — modify, extend, delete as needed
- Updates are manual (`npx shadcn@latest add <component>` overwrites your file)
- No `node_modules` shadcn package — only the underlying primitives (Radix UI, etc.)

### Project Structure

```
components.json              ← shadcn configuration (aliases, style, base color)
src/
  components/
    ui/                      ← shadcn primitives (DO NOT put custom components here)
      button.tsx
      dialog.tsx
      input.tsx
      ...
    custom/                  ← your composed components using shadcn primitives
      user-form.tsx
      data-table-toolbar.tsx
      ...
  lib/
    utils.ts                 ← cn() utility function
```

### The `cn()` Utility

All class merging uses `cn()` from `@/lib/utils`. This wraps `clsx` + `tailwind-merge` for conflict-free class composition:

```tsx
import { cn } from "@/lib/utils"

// cn() merges classes, resolving Tailwind conflicts correctly
<div className={cn("px-4 py-2", variant === "ghost" && "bg-transparent", className)} />
```

**NEVER** use raw string concatenation for classes. **ALWAYS** use `cn()`.

## Component Usage Patterns

### Import Convention

Always import from `@/components/ui/`:

```tsx
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
```

### Composition Pattern

shadcn components are composition-first. Complex UI is built by nesting primitives:

```tsx
// Pattern: composed form field with label, input, and error
function FormField({ label, error, ...inputProps }: FormFieldProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor={inputProps.id}>{label}</Label>
            <Input {...inputProps} className={cn(error && "border-destructive")} />
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
```

### Variant Props

Most shadcn components use `variant` and `size` props powered by `cva` (class-variance-authority):

```tsx
<Button variant="default" />     // primary action
<Button variant="secondary" />   // secondary action
<Button variant="destructive" /> // dangerous action
<Button variant="outline" />     // bordered, no fill
<Button variant="ghost" />       // no border, no fill
<Button variant="link" />        // text-only, underlined

<Button size="default" />        // standard
<Button size="sm" />             // compact
<Button size="lg" />             // prominent
<Button size="icon" />           // square, for icon-only buttons
```

### Extending Components

When you need custom variants, extend the existing component file in `ui/`:

```tsx
// In @/components/ui/button.tsx — add a new variant
const buttonVariants = cva("...", {
    variants: {
        variant: {
            default: "...",
            // ... existing variants
            success: "bg-green-600 text-white hover:bg-green-700",  // ← added
        },
    },
});
```

**DO NOT** create wrapper components just to add a className. Extend the variant system instead.

### The `asChild` Pattern

Many shadcn components support `asChild` prop (from Radix UI Slot). This renders the child element instead of the default element, merging props:

```tsx
// Render a link that looks like a button
<Button asChild>
    <Link href="/dashboard">Go to Dashboard</Link>
</Button>

// Render a custom trigger for a dialog
<DialogTrigger asChild>
    <Button variant="outline">Open Settings</Button>
</DialogTrigger>
```

## Theming

### CSS Variables (Default)

shadcn uses CSS variables for theming. All colors reference semantic tokens:

```css
/* Semantic tokens — defined in globals.css */
--background          /* page background */
--foreground          /* default text */
--primary             /* primary actions, buttons */
--primary-foreground  /* text on primary background */
--secondary           /* secondary elements */
--muted               /* subtle backgrounds */
--muted-foreground    /* subtle text (placeholders, hints) */
--accent              /* hover states, highlights */
--destructive         /* error, danger, delete */
--border              /* borders, dividers */
--input               /* input borders */
--ring                /* focus ring */
```

### Using Theme Colors in Code

**ALWAYS** use semantic color classes, **NEVER** raw Tailwind colors:

```tsx
// ✅ Correct — uses theme tokens
<p className="text-muted-foreground">Helper text</p>
<div className="bg-card border border-border rounded-lg">...</div>
<span className="text-destructive">Error message</span>

// ❌ Wrong — hardcoded colors bypass theming
<p className="text-gray-500">Helper text</p>
<div className="bg-white border border-gray-200 rounded-lg">...</div>
<span className="text-red-500">Error message</span>
```

### Dark Mode

shadcn supports dark mode via `.dark` class on `<html>` or `<body>`. When implementing dark mode:

- Use the semantic CSS variables (they auto-switch in dark mode)
- If you must add custom colors, define both `:root` and `.dark` variants
- Use `@custom-variant dark (&:is(.dark *))` in Tailwind v4

### Custom Themes

To customize the theme, modify CSS variables in `globals.css`. Use oklch color space (shadcn default since v2):

```css
:root {
    --primary: oklch(0.21 0.006 285.885);
    --primary-foreground: oklch(0.985 0 0);
}
```

Use the shadcn themes tool (ui.shadcn.com/themes) to generate color palettes, then paste into your CSS.

## Common Component Patterns

### Dialog / Sheet

```tsx
<Dialog>
    <DialogTrigger asChild>
        <Button>Edit Profile</Button>
    </DialogTrigger>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Make changes to your profile here.</DialogDescription>
        </DialogHeader>
        {/* form content */}
        <DialogFooter>
            <Button type="submit">Save changes</Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
```

Use `Dialog` for focused actions. Use `Sheet` for side panels with more content.

### Form with React Hook Form + Zod

shadcn provides a `Form` component that integrates with React Hook Form:

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "" },
});

<Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
    </form>
</Form>
```

### Data Table with TanStack Table

shadcn's DataTable pattern uses `@tanstack/react-table`:

```tsx
import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"

const columns: ColumnDef<Payment>[] = [
    { accessorKey: "status", header: "Status" },
    { accessorKey: "email", header: "Email" },
    {
        accessorKey: "amount",
        header: () => <div className="text-right">Amount</div>,
        cell: ({ row }) => {
            const amount = parseFloat(row.getValue("amount"));
            const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
            return <div className="text-right font-medium">{formatted}</div>;
        },
    },
];

<DataTable columns={columns} data={payments} />
```

### Sidebar

shadcn provides a Sidebar component with its own CSS variables (`--sidebar-*`):

```tsx
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarMenuItem } from "@/components/ui/sidebar"

<SidebarProvider>
    <Sidebar>
        <SidebarContent>
            <SidebarGroup>
                <SidebarMenuItem>Dashboard</SidebarMenuItem>
                <SidebarMenuItem>Orders</SidebarMenuItem>
            </SidebarGroup>
        </SidebarContent>
    </Sidebar>
    <main>{children}</main>
</SidebarProvider>
```

### Charts (Recharts)

shadcn wraps Recharts with themed components:

```tsx
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

const chartConfig = {
    desktop: { label: "Desktop", color: "var(--chart-1)" },
    mobile: { label: "Mobile", color: "var(--chart-2)" },
} satisfies ChartConfig;

<ChartContainer config={chartConfig}>
    <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
    </BarChart>
</ChartContainer>
```

## Common Pitfalls -- NEVER Rules

- **NEVER** install shadcn as a npm package — use `npx shadcn@latest add <component>` to copy components into your project.
- **NEVER** put custom/composed components in `@/components/ui/` — that directory is for shadcn primitives only. Custom components go in `@/components/custom/` or feature directories.
- **NEVER** use raw Tailwind colors (`text-gray-500`, `bg-blue-600`) when semantic tokens exist (`text-muted-foreground`, `bg-primary`). Hardcoded colors break theming.
- **NEVER** use string concatenation for class names — always use `cn()` from `@/lib/utils`.
- **NEVER** create wrapper components just to add a className — extend the variant system in the `ui/` file instead.
- **NEVER** modify `ui/` files AND forget to check if `npx shadcn add` will overwrite your changes — document custom modifications.
- **NEVER** use `onClick` on `DialogTrigger` or `SheetTrigger` — use `asChild` and put the handler on the child element.
- **NEVER** forget `asChild` when wrapping a custom element inside a shadcn trigger/slot component.
- **NEVER** hardcode chart colors — use `var(--chart-N)` CSS variables that auto-adapt to dark mode.

## Must-Haves

- **`cn()` for all class merging.** Every dynamic className uses `cn()`. No exceptions.
- **Semantic color tokens.** All colors reference CSS variables (`text-foreground`, `bg-card`, `border-border`), never raw Tailwind palette colors.
- **`components.json` configuration.** Project has a valid `components.json` with correct aliases, style, and Tailwind CSS path.
- **Separate `ui/` from custom components.** shadcn primitives in `ui/`, composed components elsewhere.
- **`asChild` on triggers.** When using custom elements as triggers (Dialog, Sheet, Tooltip, Popover), always use `asChild`.
- **Accessible by default.** shadcn components are built on Radix UI — preserve their accessibility by not removing ARIA attributes or keyboard handlers.

## Good Practices

- **Use the CLI to add components.** `npx shadcn@latest add button dialog input` — don't manually copy files.
- **Extend variants, don't wrap.** Need a "success" button? Add a variant to `button.tsx`, don't create `SuccessButton.tsx`.
- **Compose complex UI from primitives.** A settings form = `Dialog` + `Form` + `Input` + `Select` + `Button`. Don't build monolithic components.
- **Use `Sheet` for mobile navigation.** On small screens, swap `Sidebar` for `Sheet` with the same content.
- **Check existing components before building custom.** shadcn has 50+ components — search before building from scratch.
- **Use `Sonner` for toasts.** shadcn integrates with `sonner` — don't build custom toast systems.
- **Leverage chart theming.** Use `ChartConfig` + CSS variables for consistent chart styling across light/dark modes.

## Common Bugs

- **Missing `cn()` import.** Forgetting to import `cn` from `@/lib/utils` when adding dynamic classes.
- **Hardcoded colors in custom components.** Using `text-gray-500` instead of `text-muted-foreground` — works in light mode, breaks in dark mode.
- **Missing `asChild` on triggers.** `DialogTrigger` without `asChild` renders an extra button element, causing nested `<button>` HTML violations.
- **Overwriting customized `ui/` files.** Running `npx shadcn add button` overwrites your custom variants. Use `--diff` flag to preview changes first.
- **Wrong import paths.** Importing from `@radix-ui/react-dialog` directly instead of `@/components/ui/dialog`. Always use the shadcn wrapper.
- **Sidebar CSS variable conflicts.** Sidebar uses `--sidebar-*` variables. If you override `--background` globally, sidebar may look wrong.
- **Form validation not showing.** Forgetting `<FormMessage />` inside `<FormField>` — errors exist but aren't displayed.
- **Data table pagination state.** Not controlling pagination state externally when using server-side pagination with TanStack Table.

## Anti-Patterns

- **Component soup in `ui/`.** Putting everything in `@/components/ui/` — it should only contain shadcn primitives, not your business components.
- **Wrapping every shadcn component.** Creating `MyButton`, `MyInput`, `MyDialog` wrappers that just pass props through — extend variants instead.
- **Ignoring the `components.json` aliases.** Importing from hardcoded paths instead of using the configured aliases.
- **Building custom components that shadcn already provides.** Check the component list (ui.shadcn.com/docs/components) before building custom modals, popovers, or dropdowns.
- **Mixing Radix UI direct usage with shadcn wrappers.** Pick one. shadcn wraps Radix — don't also import Radix directly for the same component.
- **Ignoring dark mode.** Using colors that look good in light mode only. Test both modes.
- **Static chart colors.** Using `fill="#2563eb"` instead of `fill="var(--color-desktop)"` — breaks theming and dark mode.

## Context7 Instructions

When looking up shadcn/ui documentation, use these Context7 library identifiers:

- **shadcn/ui:** `/websites/ui_shadcn` — components, theming, configuration, patterns
- **Radix UI:** `radix-ui/primitives` — underlying primitives, accessibility, composition API
- **TanStack Table:** `tanstack/table` — data table patterns, sorting, filtering, pagination
- **Recharts:** `recharts/recharts` — chart components used by shadcn charts

Always check Context7 for component APIs — shadcn updates frequently and component props may change between versions.
