/*
 * Bot Arena - map definitions.
 *
 * Maps are built with a tiny helper so they stay perfectly symmetrical (fair for both teams).
 * Legend of the generated grid:
 *   '#'  wall            (solid)
 *   'x'  crate / cover   (solid)
 *   'v'  vehicle         (solid)
 *   '.'  indoor floor
 *   ','  outdoor ground
 *
 * Every put() call also stamps the mirrored copy of itself:
 *   sym 'h' -> mirrored left <-> right
 *   sym 'r' -> rotated 180 degrees (point symmetry)
 *
 * To add your own map, copy one of the builders below, add it to MAPS at the bottom,
 * and give it a name, description and (up to) 5 spawn cells for team A.
 * Team B spawns are mirrored automatically.
 */
(function (root) {
  'use strict';

  class Builder {
    constructor(w, h, sym, floor) {
      this.w = w;
      this.h = h;
      this.sym = sym;
      this.g = [];
      for (let y = 0; y < h; y++) this.g.push(new Array(w).fill(floor));
    }

    _rect(x, y, w, h, ch) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.g[j][i] = ch;
        }
      }
    }

    // stamp a rectangle and its mirror image
    put(x, y, w, h, ch) {
      this._rect(x, y, w, h, ch);
      if (this.sym === 'h') this._rect(this.w - x - w, y, w, h, ch);
      else if (this.sym === 'r') this._rect(this.w - x - w, this.h - y - h, w, h, ch);
    }

    border() {
      this.put(0, 0, this.w, 1, '#');
      this.put(0, this.h - 1, this.w, 1, '#');
      this.put(0, 0, 1, this.h, '#');
      this.put(this.w - 1, 0, 1, this.h, '#');
    }

    // a walled building with an indoor floor (cut doors afterwards with put(...,'.'))
    house(x, y, w, h) {
      this.put(x, y, w, 1, '#');
      this.put(x, y + h - 1, w, 1, '#');
      this.put(x, y, 1, h, '#');
      this.put(x + w - 1, y, 1, h, '#');
      this.put(x + 1, y + 1, w - 2, h - 2, '.');
    }

    mirrorCell(c) {
      if (this.sym === 'h') return [this.w - 1 - c[0], c[1]];
      if (this.sym === 'r') return [this.w - 1 - c[0], this.h - 1 - c[1]];
      return [c[0], c[1]];
    }

    finish(info, spawnsA) {
      return {
        name: info.name,
        desc: info.desc,
        size: info.size,
        w: this.w,
        h: this.h,
        grid: this.g.map((r) => r.join('')),
        spawnsA: spawnsA,
        spawnsB: spawnsA.map((c) => this.mirrorCell(c)),
      };
    }
  }

  /* ------------------------------------------------------------------ 5v5 */

  function nuketown() {
    const b = new Builder(40, 24, 'h', ',');
    b.border();

    // the two houses (the other one is the mirror image)
    b.house(3, 3, 9, 18);
    b.put(7, 4, 1, 16, '#');          // dividing wall
    b.put(7, 7, 1, 2, '.');           // inner doorways
    b.put(7, 15, 1, 2, '.');
    b.put(11, 8, 1, 2, '.');          // front doors
    b.put(11, 14, 1, 2, '.');
    b.put(9, 3, 2, 1, '.');           // north + south side doors
    b.put(9, 20, 2, 1, '.');
    b.put(3, 11, 1, 2, '.');          // back door

    // yard cover: the bus, cars and crates
    b.put(17, 10, 6, 4, 'v');         // bus in the middle
    b.put(14, 5, 3, 2, 'v');          // cars
    b.put(14, 17, 3, 2, 'v');
    b.put(13, 11, 1, 2, 'x');         // crates
    b.put(19, 5, 2, 1, 'x');
    b.put(19, 18, 2, 1, 'x');
    b.put(15, 9, 1, 1, 'x');
    b.put(15, 14, 1, 1, 'x');

    return b.finish(
      {
        name: 'Nuketown',
        size: 5,
        desc: 'Two houses face off across a yard with a bus, cars and crates. Flank through the side doors.',
      },
      [[5, 5], [5, 9], [5, 12], [5, 16], [5, 18]]
    );
  }

  function neighbourhood() {
    const b = new Builder(40, 24, 'h', ',');
    b.border();

    // top-left house
    b.house(3, 2, 7, 7);
    b.put(5, 8, 2, 1, '.');           // south door
    b.put(9, 5, 1, 2, '.');           // east door
    b.put(6, 3, 1, 2, '#');           // little partition

    // bottom-left house
    b.house(3, 14, 7, 7);
    b.put(5, 14, 2, 1, '.');          // north door
    b.put(9, 17, 1, 2, '.');          // east door
    b.put(6, 17, 1, 2, '#');

    // garage near the middle
    b.house(13, 9, 5, 6);
    b.put(13, 11, 1, 2, '.');
    b.put(17, 11, 1, 2, '.');

    // fences, cars and bins
    b.put(11, 2, 1, 5, 'x');
    b.put(11, 17, 1, 5, 'x');
    b.put(14, 4, 2, 2, 'x');
    b.put(14, 18, 2, 2, 'x');
    b.put(19, 6, 2, 2, 'x');
    b.put(19, 16, 2, 2, 'x');
    b.put(7, 11, 3, 2, 'v');          // parked car in the spawn yard
    b.put(12, 8, 1, 1, 'x');
    b.put(12, 15, 1, 1, 'x');

    return b.finish(
      {
        name: 'Neighbourhood',
        size: 5,
        desc: 'A quiet street of houses, fences and a garage in the middle. Lots of corners and doors.',
      },
      [[2, 10], [2, 13], [4, 9], [4, 12], [6, 10]]
    );
  }

  /* ------------------------------------------------------------------ 1v1 */

  function simpleArena() {
    const b = new Builder(28, 16, 'h', '.');
    b.border();
    b.put(13, 6, 2, 4, 'x');          // centre pillar
    b.put(6, 3, 1, 3, 'x');
    b.put(6, 10, 1, 3, 'x');
    b.put(9, 7, 1, 2, 'x');
    b.put(10, 2, 2, 1, 'x');
    b.put(10, 13, 2, 1, 'x');

    return b.finish(
      {
        name: 'Simple Arena',
        size: 1,
        desc: 'A small open arena with a few pillars for cover. Pure aim and movement.',
      },
      [[2, 8]]
    );
  }

  function csDuel() {
    const b = new Builder(36, 22, 'r', '.');
    b.border();

    // long walls that split the map into top lane / mid / bottom lane
    b.put(8, 6, 20, 1, '#');
    b.put(8, 15, 20, 1, '#');

    // mid doors / pillars + centre box
    b.put(12, 7, 2, 2, '#');
    b.put(16, 10, 4, 2, 'x');
    b.put(17, 7, 2, 1, 'x');

    // lane cover and narrowed lane entrances
    b.put(16, 3, 2, 2, 'x');
    b.put(8, 1, 2, 2, '#');
    b.put(22, 2, 1, 2, 'x');

    // cover in the spawn zones
    b.put(4, 9, 2, 1, 'x');
    b.put(4, 12, 2, 1, 'x');
    b.put(3, 4, 1, 2, 'x');

    return b.finish(
      {
        name: 'Dust Duel',
        size: 1,
        desc: 'CS-style layout: a long top lane, a mid with boxes and pillars, and a tight bottom lane.',
      },
      [[2, 10]]
    );
  }

  root.BOT_MAPS = {
    '5v5': [nuketown(), neighbourhood()],
    '1v1': [simpleArena(), csDuel()],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.BOT_MAPS;
})(typeof window !== 'undefined' ? window : globalThis);
