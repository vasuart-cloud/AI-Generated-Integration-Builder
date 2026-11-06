// Vercel Express entrypoint: the server's local TypeScript imports are bundled
// at build time into server-bundle.mjs, avoiding missing ESM runtime imports.
import express from 'express';
import backendApp from './server-bundle.mjs';

// Keep a direct Express import so Vercel's Express framework detects this entry.
void express;
export default backendApp;
