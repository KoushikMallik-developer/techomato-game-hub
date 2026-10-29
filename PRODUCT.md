# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Casual drop-in players.** Arrive at the site, pick a 3D game and are playing within seconds, on desktop or on a phone (some games are built for a phone held upright). No install.
- **Friend groups playing online.** One player hosts a room and shares a 5-letter code; friends join from their own browsers. Friends who have accounts can see each other's hosted room code.
- **Returning players chasing progress.** Signed-in players who come back for levels, unlocks, daily challenges, leaderboards (all-time and weekly) and achievements.
- **Techomato's existing audience.** People who know Techomato and arrive from its main site; this is the games section of that brand.

## Product Purpose

Techomato Games (games.techomato.com) is a library of real 3D games that run directly in the browser. A player signs in once and their progress, scores and rank follow them across devices. Success is a player starting a game within seconds of landing, coming back to continue their progress, and playing with friends.

## Positioning

Real 3D games, instantly and free: full 3D titles (a tactical shooter, a 50-player battle royale, an open-world racer, a crowd battler) that load in a browser tab with no download, backed by accounts, cloud saves and leaderboards.

## Operating Context

- Games load lazily per title; each is a Three.js game mounted into a frame on its own play page (`/play/<id>`), with full-screen, keyboard, mouse, gamepad and touch controls depending on the game.
- Playing requires a signed-in account when Firebase is configured, so progress and scores can be saved. Sign-in methods: Google, GitHub, email and password.
- Online play is peer-to-peer (WebRTC) with a host-authoritative match; bots fill empty slots; a TURN relay (Metered, via a serverless function) lets players connect across networks.
- Hosted on Vercel; accounts, cloud saves, leaderboards and friends run on Firebase's free Spark plan, which has no server code.

## Capabilities and Constraints

- Four games today: Ascendants (50-player anime-style battle royale), Horde Surge (crowd battler), Core Breach (5v5 tactical shooter), Midnight Pursuit (open-world racing and police pursuits).
- Accounts: profiles (name, avatar from Google, GitHub or Gravatar, or an emoji), cloud saves per game, per-game and global leaderboards, friends by code, site-wide achievements.
- Each game keeps saving to its own localStorage; the account layer syncs that save, so games stay playable and unchanged without accounts configured.
- Free tiers only: no paid services, no dedicated game servers, no Cloud Functions. Leaderboards are therefore validated by Firestore rules only (caps, monotonic scores, rate limits), not server-side; a determined cheater who edits their own save can still post a plausible score.
- Terminology: "hub points" (global score across games), "boards" (leaderboards), "friend code" (8 characters), "room code" (5 characters).

## Brand Commitments

- This is the games section of the Techomato brand and must stay consistent with Techomato's identity; the site name is "Techomato Games".
- Original assets only: games, characters, maps, sounds and textures are original or generated in code. Anything third-party must be properly licensed and credited.
- No ads and no tracking. The only data collected is what accounts need (name, sign-in identity, game progress, scores, friends).

## Evidence on Hand

- Four playable games with real in-game cover art in `public/covers/` (one JPG per game).
- Third-party assets with credits: a CC BY 4.0 car model (`public/models/cars/CREDITS.txt`) and CC0 HDRI skies and textures from Poly Haven (`public/assets/CREDITS.txt`).
- No testimonials, player counts, reviews, press or usage statistics exist; none should be invented.

## Product Principles

1. **Time to play beats everything.** From landing to gameplay should take seconds; nothing between the player and the game earns its place unless it protects their progress.
2. **Progress is the reason to come back.** Saves, levels, ranks and achievements must feel trustworthy: never lose a player's progress, and say clearly when it is saved.
3. **Friends are one code away.** Playing together should need nothing more than sharing a short code.
4. **Honest about what it is.** Free, in-browser, no ads, no tracking, original work; make no claims the product cannot back (no fake players online, no inflated rankings).
5. **Every game stays a game first.** The portal frames the games; it never competes with them for the player's attention.

## Accessibility & Inclusion

No product-specific standard has been set. Games support keyboard, mouse, gamepad and touch input, and the site follows the system light and dark theme. Treat a required accessibility standard as an open decision to confirm before relying on one.
