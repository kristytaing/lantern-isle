# Lantern Isle: Guardian Star

> *A cozy isometric adventure — made for VibeJam 2026*

[![Play Now](https://img.shields.io/badge/Play%20Now-Live%20Game-9B9AE2?style=for-the-badge&logo=github)](https://ktaing.com/lantern-isle/)

---

## About

You are the Lantern Bearer — a wanderer who arrives at a fading archipelago the night the Guardian Star went dark. Guide your chibi adventurer across **6 hand-crafted islands**, earning the trust of islanders, collecting crystal shards, and awakening ancient shrines to restore light to the world.

Every crystal is earned, not found. Help the people first — then the shards appear.

---

## How It Works

Each island has **3 NPCs**, each with a quest. Complete their requests — fetch lost items, gather offerings, earn their trust — and a crystal shard materializes near them as a reward. Collect all shards, then bring them to the shrine at the island's heart.

The shrine awakens with a beam of light, grants you a new ability, and unlocks the next island.

**Quests per island:**
- Two item-fetch quests (find a collectible on the island, deliver it to the NPC)
- One elder quest (requires both other quests first)

---

## Features

- **6 distinct biomes** — unique skyboxes, terrain palettes, fog, flora, and NPC characters per island
- **Quest-gated crystal system** — shards are invisible until earned; each appears near the NPC who rewards it
- **Ability progression** — Lantern Pulse, Sprint, Heat Ward, Whistle, Sonar Echo unlocked island by island
- **Procedural audio** — generative music and SFX per island, zero file downloads
- **Mobile ready** — virtual joystick + action button, touch-tuned input mapping

---

## Controls

| Input | Action |
|-------|--------|
| WASD / Arrow Keys | Move |
| E / Space / Enter | Interact / Advance dialogue |
| Shift | Sprint (unlocked at Sunflower Beach) |
| Q | Lantern Pulse (unlocked at Mossy Forest) |
| M / Tab | World Map |
| Escape | Close map |

Mobile: on-screen joystick (bottom-left) + action button (bottom-right).

---

## Tech

- **Three.js** r160 — ES modules via CDN, no build step
- **Isometric camera** — `OrthographicCamera` at 45° for classic 2.5D perspective
- **Procedural terrain** — per-island tile shapes with deterministic hash-based decoration
- **Web Audio API** — fully generative music and SFX, no audio files
- **Canvas 2D** — world map, thought bubbles, water shimmer
- **GitHub Pages** — instant deploy, zero backend

---

Built for [VibeJam 2026](https://vibej.am/2026)
