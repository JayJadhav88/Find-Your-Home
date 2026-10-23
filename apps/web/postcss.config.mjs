// Tailwind CSS through PostCSS: works with both Turbopack (local) and webpack (Hostinger builds).
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
