import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: ["tmp/**"],
  },
  ...nextVitals,
];

export default eslintConfig;
