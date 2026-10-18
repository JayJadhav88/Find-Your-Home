// Brand design tokens shared by web (Tailwind/CSS variables) and mobile (RN theme).
// Placeholder palette: warm, residential, high-contrast. Replace when brand assets are supplied.

export const colors = {
  brand: "#1F5F57",
  brandStrong: "#164640",
  brandSoft: "#E3EFEC",
  accent: "#C8693B",
  surface: "#FFFFFF",
  surfaceMuted: "#F6F4F0",
  border: "#DAD5CC",
  text: "#1C1B19",
  textMuted: "#5C5850",
  danger: "#B42318",
  success: "#1E7A44",
  warning: "#9A6700",
  focus: "#2563EB",
} as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 40 } as const;

export const tokens = { colors, radius, spacing, fontSize } as const;
export type Tokens = typeof tokens;
