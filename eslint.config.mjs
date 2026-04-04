import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    ignores: ["src/generated/**"],
  },
];

export default config;
