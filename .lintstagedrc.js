// .lintstagedrc.js
// export default {
//   "*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html}": ["cspell lint --no-fail-on-unfound"],
//   "*.{js,ts,vue}": ["prettier --write", "eslint"]
// };
export default {
  "*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}": [
    "prettier --write",
    "eslint --fix",
    "cspell lint --no-fail-on-unfound"
  ]
};
