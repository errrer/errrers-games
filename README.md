# Bot Arena

A top-down team shooter against bots, written in plain JavaScript and `<canvas>`. No build step, no dependencies - just open `index.html`.

## Game modes

| Mode | Maps |
| --- | --- |
| **5 v 5** (you + 4 bots vs 5 bots) | Nuketown, Neighbourhood |
| **1 v 1** (you vs a bot) | Simple Arena, Dust Duel (CS-style lanes + mid) |

**Rules**

- Every round starts with a **3 second countdown** (everyone is frozen until it hits zero).
- When a whole team is eliminated, the other team gets **1 point**.
- **First to 3 points wins.** You are then sent back to the main menu, which shows **YOU WIN** or **YOU LOSE**.
- If a round runs past 75 seconds, the team with more players alive (then more total health) wins it.
- In 5v5 you keep watching if you die while teammates are still alive.
- You only see enemies that you or a living teammate has line of sight to.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` / arrow keys | Move |
| Mouse | Aim |
| Hold left mouse button | Shoot |
| `Esc` | Pause / resume |
| `Q` (while paused) | Quit to menu |
| `M` | Mute / unmute |

Bot difficulty (Easy / Normal / Hard) is picked on the main menu.

## Play it on GitHub Pages

1. Create a new repository and upload all the files in this folder (`index.html`, `style.css`, `maps.js`, `game.js`, `README.md`).
2. Go to **Settings -> Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
4. After a minute your game is live at `https://<your-username>.github.io/<repo-name>/`.

You can also just double-click `index.html` to play locally.

## Project layout

```
index.html   page + menu markup
style.css    menu and layout styling
maps.js      map definitions (built with a small symmetric helper)
game.js      game loop, bot AI, rendering, menu logic
```

## Tweaking

Everything you are likely to want to change is at the top of `game.js`:

- `WIN_SCORE`, `COUNTDOWN`, `ROUND_LIMIT` - match rules
- `WEAPON` - fire rate, bullet speed, damage
- `DIFFICULTY` - bot speed, accuracy (`spread`), reaction time, aim leading

### Adding a map

Open `maps.js`, copy one of the builder functions (for example `simpleArena`) and edit it:

- `b.put(x, y, w, h, ch)` stamps a rectangle **and its mirror image**, so maps stay fair.
  Tile characters: `#` wall, `x` crate, `v` vehicle, `.` indoor floor, `,` outdoor ground.
- `b.house(x, y, w, h)` makes a walled building; cut doors into it with `b.put(..., '.')`.
- The last argument of `finish()` is the list of team A spawn cells (use 5 for a 5v5 map, 1 is enough for 1v1). Team B spawns are mirrored automatically.

Then add your function to the `BOT_MAPS` list at the bottom of the file and it shows up in the map select screen.
