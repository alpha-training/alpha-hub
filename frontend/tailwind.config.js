/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
  
    // ⭐ Force classic Tailwind engine
    presets: [require("tailwindcss/preset")()],
  
    // ⭐ Disable the new Tailwind 4 Design System
    experimental: {
      disableDesignSystem: true,
    },
  
    theme: {
      extend: {},
    },
  };
  