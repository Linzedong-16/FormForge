@echo off
chcp 65001 > nul
pnpm exec tsx watch src/index.ts
