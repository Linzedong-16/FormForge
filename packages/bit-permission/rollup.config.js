import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named"
      },
      {
        file: "dist/index.esm.js",
        format: "es",
        sourcemap: true
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: "tsconfig.json",
        sourceMap: true,
        inlineSources: true
      })
    ]
  },
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.d.ts",
      format: "es"
    },
    plugins: [dts()]
  }
];
