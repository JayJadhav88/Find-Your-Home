// Brand design tokens shared by web (Tailwind/CSS variables) and mobile (RN theme).
// Palette from the Find Your Home logo: navy (brand) and orange (accent).

export const colors = {
  brand: "#0B3266",
  brandStrong: "#001F42",
  brandSoft: "#E7EEF8",
  accent: "#F28C0F",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F6FA",
  border: "#D8DEE8",
  text: "#141B26",
  textMuted: "#526075",
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
