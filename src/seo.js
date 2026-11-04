// Page titles and descriptions, shared by the browser (src/App.jsx, GamePage.jsx) and the build step (seo.plugin.js).
import { SITE_NAME } from './config.js';

export const HOME_TITLE = `${SITE_NAME} – Free 3D Browser Games, No Download`;
export const HOME_DESC = 'Play free 3D games in your browser on phone or desktop: battle royale, shooter, racing, platformer and puzzle games. No download, sign in to save progress and play online with friends.';
export const gameTitle = (g) => `${g.title} – Free ${g.genre} Game Online | ${SITE_NAME}`;
export const gameDesc = (g) => `Play ${g.title} free in your browser. ${g.tagline} No download needed.`;
