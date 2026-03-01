import type { TeammateState } from "@/types";

export interface StateAnimation {
  frames: number;
  frameDuration: number; // ms per frame
  loop: "loop" | "pingpong"; // loop = 0,1,2,3,0,1... / pingpong = 0,1,2,3,2,1,0...
}

export interface AgentSpriteConfig {
  id: string;
  displayName: string;
  base: string; // base prompt fragment for consistent character look
  states: Record<
    TeammateState,
    StateAnimation & { prompts: string[] } // prompts consumed by generator only
  >;
}

// Lock this after visual comparison of 64 vs 128
export const SPRITE_RESOLUTION = 64;

export const agentSprites: Record<string, AgentSpriteConfig> = {
  maya: {
    id: "maya",
    displayName: "Maya",
    base: "tiny cute teal robot girl, round head, small antenna, glowing cyan eyes, teal body, medical cross emblem",
    states: {
      idle: {
        frames: 4,
        frameDuration: 250,
        loop: "pingpong",
        prompts: [
          "browsing tiny holographic medical chart, antenna left",
          "chart dimmed, antenna centered, eyes half-closed",
          "swiping on chart, antenna right",
          "chart bright, antenna centered, eyes wide curious",
        ],
      },
      thinking: {
        frames: 4,
        frameDuration: 200,
        loop: "loop",
        prompts: [
          "typing rapidly on floating keyboard, antenna dim",
          "typing faster, antenna bright, eyes focused",
          "paused typing, antenna sparking, squinting at data",
          "eureka moment, antenna pulsing, lightbulb above head",
        ],
      },
      talking: {
        frames: 4,
        frameDuration: 150,
        loop: "loop",
        prompts: [
          "mouth open, gesturing right hand, excited discovery",
          "mouth closed, both hands up showing data, sparkles",
          "mouth wide, leaning forward enthusiastic, antenna bright",
          "big smile, pointing at chart, antenna wagging",
        ],
      },
      interrupted: {
        frames: 4,
        frameDuration: 120,
        loop: "pingpong",
        prompts: [
          "startled, screen glitching static, antenna jolts up",
          "eyes wide, screen flickering, hands pulled back",
          "screen cracking apart, antenna sparking, surprised",
          "screen reforming, antenna settling, blinking confused",
        ],
      },
      reacting: {
        frames: 4,
        frameDuration: 200,
        loop: "pingpong",
        prompts: [
          "nodding along, small smile, antenna bobbing",
          "leaning in interested, antenna tilted forward",
          "nodding faster, taking notes on screen, engaged",
          "slight head tilt, antenna perked, listening intently",
        ],
      },
      agreeing: {
        frames: 4,
        frameDuration: 130,
        loop: "loop",
        prompts: [
          "jumping excitedly, eyes sparkling, antenna spinning",
          "fist pump, screen showing checkmark, antenna bright",
          "clapping hands, sparkle burst, huge smile",
          "bouncing on feet, heart eyes, antenna glowing max",
        ],
      },
    },
  },
  rex: {
    id: "rex",
    displayName: "Rex",
    base: "small angular red robot, sharp visor, mechanical arms, coral red body, caution symbol, tough looking",
    states: {
      idle: {
        frames: 4,
        frameDuration: 300,
        loop: "pingpong",
        prompts: [
          "arms crossed, standing cool, visor dim glow",
          "arms crossed, lean left, visor flicker",
          "arms crossed, head tilted, visor steady scan",
          "arms crossed, weight shift right, visor pulse",
        ],
      },
      thinking: {
        frames: 4,
        frameDuration: 200,
        loop: "loop",
        prompts: [
          "stroking chin, visor scanning left, analyzing",
          "hand on chin, visor scanning right, processing",
          "arms uncrossed examining hologram, visor bright",
          "one eye glowing intense, hand raised, breakthrough",
        ],
      },
      talking: {
        frames: 4,
        frameDuration: 120,
        loop: "loop",
        prompts: [
          "pointing forward assertive, mouth open, bold stance",
          "gesturing both mechanical hands, visor bright red",
          "one fist raised making point, commanding",
          "hands spread wide explaining, visor flashing",
        ],
      },
      interrupted: {
        frames: 4,
        frameDuration: 100,
        loop: "pingpong",
        prompts: [
          "eyebrow raised, visor flash white, caught off guard",
          "arms uncrossing reflexive, visor flickering, annoyed",
          "head snapping to look, visor red alert, defensive",
          "settling back, visor dimming, re-crossing arms, grumpy",
        ],
      },
      reacting: {
        frames: 4,
        frameDuration: 250,
        loop: "pingpong",
        prompts: [
          "skeptical side-eye, arms crossed, visor narrowed",
          "slight head shake, visor scanning, unconvinced",
          "grudging nod, one arm uncrossed, visor steady",
          "chin up assessing, visor analyzing, reserved",
        ],
      },
      agreeing: {
        frames: 4,
        frameDuration: 140,
        loop: "loop",
        prompts: [
          "shaking head firmly, visor red flash, arms rejecting",
          "crossing arms tighter, visor angry, disapproval",
          "hand up stop gesture, visor flaring, flagging issue",
          "turning away, visor dimming, arms folded, done",
        ],
      },
    },
  },
  sol: {
    id: "sol",
    displayName: "Sol",
    base: "round wise gold robot, single large yellow lens eye, small floating orbs, gold body, calm",
    states: {
      idle: {
        frames: 4,
        frameDuration: 350,
        loop: "pingpong",
        prompts: [
          "writing floating notebook, orbs orbit slowly, lens dim",
          "notebook lowered, orbs paused, lens steady warm",
          "looking up from notebook, orbs drifting, lens warm",
          "notebook raised, orbs close together, lens bright",
        ],
      },
      thinking: {
        frames: 4,
        frameDuration: 180,
        loop: "loop",
        prompts: [
          "looking upward, orbs spinning fast, lens brightening",
          "eyes closed, orbs triangle formation, lens pulsing",
          "head tilted, orbs aligned vertical, lens deep focus",
          "orbs scattered wide, lens very bright, contemplating",
        ],
      },
      talking: {
        frames: 4,
        frameDuration: 160,
        loop: "loop",
        prompts: [
          "presenting one hand, charts floating, calm gesture",
          "both hands out, orbs highlighting points, lens warm",
          "decisive nod, orbs neat row, lens golden flash",
          "gentle hand wave, orbs orbiting, wise expression",
        ],
      },
      interrupted: {
        frames: 4,
        frameDuration: 140,
        loop: "pingpong",
        prompts: [
          "pen dropping, orbs scattering outward, lens unfocus",
          "hands pulling back, orbs frozen, lens dim",
          "notebook closing, orbs slowly regrouping, lens refocus",
          "settling, orbs returning orbit, lens steady again",
        ],
      },
      reacting: {
        frames: 4,
        frameDuration: 220,
        loop: "pingpong",
        prompts: [
          "taking rapid notes, orbs pulsing, lens on speaker",
          "nodding slowly, pen moving, orbs aligned, attentive",
          "pausing to consider, orbs hovering still, lens bright",
          "writing again, orbs resuming orbit, quiet agreement",
        ],
      },
      agreeing: {
        frames: 4,
        frameDuration: 150,
        loop: "loop",
        prompts: [
          "decisive nod, lens bright gold flash, orbs snap to line",
          "stamp of approval, orbs pulse gold, lens max glow",
          "pointing notebook checkmark, orbs circling fast",
          "calm confident, orbs crown formation above, lens warm",
        ],
      },
    },
  },
};

/** Get sprite path for a specific frame */
export function spritePath(
  agentId: string,
  state: TeammateState,
  frame: number,
  resolution: number = SPRITE_RESOLUTION
): string {
  return `/sprites/${resolution}/${agentId}/${state}_${frame}.png`;
}

/** Get animation config for an agent's state */
export function getAnimation(
  agentId: string,
  state: TeammateState
): StateAnimation | null {
  return agentSprites[agentId]?.states[state] ?? null;
}
