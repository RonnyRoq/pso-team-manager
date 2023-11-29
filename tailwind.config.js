/** @type {import('tailwindcss').Config} */
export default {
  content: ["./site/**/*.{ejs,js}"],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms')
  ],
}

