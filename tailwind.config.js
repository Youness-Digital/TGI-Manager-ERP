/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17243a",
        muted: "#718096",
        canvas: "#f5f7fb",
        brand: "#2859c5",
        "brand-dark": "#1d438f",
        line: "#e7ebf2",
      },
      boxShadow: {
        card: "0 8px 26px rgba(32, 54, 91, 0.06)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
