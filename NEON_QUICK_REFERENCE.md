# Neo-Fuel Station 2077 - Quick Reference Guide

## Neon Colors

```css
/* Available in CSS as variables */
--neon-cyan: #00F5FF          /* Primary accent - Energy & focus */
--neon-magenta: #C300FF       /* Secondary accent - Power & emphasis */
--neon-green: #39FF14         /* Success & active states */
--neon-amber: #FF9500         /* Warnings & fuel metaphors */
```

## Button Variants

```tsx
// 4 new neon button variants available:
<Button variant="neon-cyan">Primary Action</Button>
<Button variant="neon-magenta">Secondary Action</Button>
<Button variant="neon-green">Success Action</Button>
<Button variant="neon-amber">Warning Action</Button>
```

## Text Utilities

```tsx
// Text colors
<p className="neon-cyan">Cyan text</p>
<p className="neon-magenta">Magenta text</p>
<p className="neon-green">Green text</p>
<p className="neon-amber">Amber text</p>

// With glow animation
<p className="neon-cyan animate-glow-pulse">Glowing cyan text</p>
```

## Border Utilities

```tsx
// Neon borders
<div className="border-2 border-neon-cyan">Cyan border</div>
<div className="border-2 border-neon-magenta">Magenta border</div>
<div className="border-2 border-neon-green">Green border</div>
<div className="border-2 border-neon-amber">Amber border</div>

// With glow
<div className="border-2 border-neon-cyan glow-cyan">Glowing cyan card</div>
```

## Animations

```tsx
// Animations available as classes
<div className="animate-energy-pulse">Expanding glow pulse</div>
<div className="animate-glow-pulse">Text glow pulsation</div>
<div className="animate-charging-orb">Rotating charging sphere</div>
<div className="animate-neon-glow">Border glow variation</div>
<div className="animate-particle-float">Floating particles</div>
<div className="animate-cyber-scan">Scan line effect</div>
<div className="animate-gradient-shift">Animated gradient</div>
```

## Glassmorphic Cards

```tsx
// Glassmorphic surfaces with backdrop blur
<div className="glass-panel p-6 rounded-lg">
  Standard glassmorphic panel
</div>

<div className="glass-panel-elevated p-6 rounded-lg">
  Elevated glassmorphic panel (more blur)
</div>
```

## Hero Section

```tsx
import { DashboardHero } from '@/components/hero/dashboard-hero'
import { EnergyOrb } from '@/components/hero/energy-orb'

// Full dashboard hero
<DashboardHero 
  stationName="Your Station" 
  tagline="Your Tagline" 
/>

// Standalone energy orb
<EnergyOrb />
```

## Common Patterns

### Neon-Accented Card
```tsx
<div className="rounded-lg border-2 border-neon-cyan bg-[var(--surface-card)] 
  glow-cyan p-6 hover:shadow-[0_0_30px_rgba(0,245,255,0.2)]">
  <h3 className="text-neon-cyan animate-glow-pulse">Title</h3>
  <p className="text-[var(--text-muted)]">Content</p>
</div>
```

### Neon Button Group
```tsx
<div className="flex gap-3">
  <Button variant="neon-cyan">Confirm</Button>
  <Button variant="neon-magenta">Secondary</Button>
  <Button variant="neon-amber" size="sm">Dismiss</Button>
</div>
```

### Status Indicator
```tsx
<div className="flex items-center gap-2 text-neon-green">
  <div className="h-2 w-2 rounded-full bg-neon-green animate-pulse" />
  <span>System Online</span>
</div>
```

### Neon Section Header
```tsx
<div className="border-b border-neon-cyan pb-4 mb-6">
  <h2 className="text-2xl font-bold bg-gradient-to-r 
    from-neon-cyan via-text-primary to-text-primary 
    bg-clip-text text-transparent">
    Section Title
  </h2>
</div>
```

## CSS Variables

```css
/* Access all neon colors and effects */
--neon-cyan: #00F5FF
--neon-magenta: #C300FF
--neon-green: #39FF14
--neon-amber: #FF9500

/* Glow shadows */
--shadow-glow-cyan: 0 0 24px rgba(0, 245, 255, 0.25)
--shadow-glow-magenta: 0 0 24px rgba(195, 0, 255, 0.25)
--shadow-glow-green: 0 0 24px rgba(57, 255, 20, 0.25)
--shadow-glow-amber: 0 0 24px rgba(255, 149, 0, 0.25)

/* Border colors */
--border-neon-cyan: rgba(0, 245, 255, 0.3)
--border-neon-magenta: rgba(195, 0, 255, 0.3)
--border-neon-green: rgba(57, 255, 20, 0.3)
--border-neon-amber: rgba(255, 149, 0, 0.3)
```

## Customizing Colors

Edit `/app/globals.css` `:root` section:

```css
:root {
  --neon-cyan: #00F5FF;        /* Change primary accent */
  --neon-magenta: #C300FF;     /* Change secondary accent */
  --neon-green: #39FF14;       /* Change success color */
  --neon-amber: #FF9500;       /* Change warning color */
}
```

## Tips & Best Practices

1. **Use One Primary Neon**: Pick one neon color per section (usually cyan)
2. **Glow Sparingly**: Not every element needs animation
3. **Color Hierarchy**: Cyan > Magenta > Green > Amber
4. **Mobile**: Reduce animation intensity on smaller screens
5. **Contrast**: Ensure text-on-background meets WCAG AA
6. **Performance**: Limit animations to 2-3 per screen on mobile

## Reduced Motion Support

All animations automatically respect `prefers-reduced-motion` system preference and run at 1ms duration for users who disable animations.
