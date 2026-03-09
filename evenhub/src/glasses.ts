/**
 * Glasses Display Controller
 *
 * Abstracts the Even Hub SDK bridge for CounselView.
 * G2 display: 576x288px, 4-bit greyscale, max 4 containers per page.
 */

import {
  waitForEvenAppBridge,
  EvenAppBridge,
  TextContainerProperty,
  ListContainerProperty,
} from "@evenrealities/even_hub_sdk";

// G2 display constants
const DISPLAY_WIDTH = 576;
const DISPLAY_HEIGHT = 288;
const MAX_CHARS_PER_LINE = 36; // conservative for readability at G2 resolution
const MAX_LINES = 8; // G2 has double the height of G1

let bridge: EvenAppBridge | null = null;
let isConnected = false;

// Event callbacks
type EventCallback = (event: any) => void;
let onTapCallback: EventCallback | null = null;
let onScrollCallback: EventCallback | null = null;
let onAudioCallback: ((pcm: Uint8Array) => void) | null = null;

/**
 * Initialize connection to G2 glasses via Even Hub bridge.
 */
export async function initGlasses(): Promise<boolean> {
  try {
    bridge = await waitForEvenAppBridge();
    isConnected = true;

    // Set up event listener
    bridge.onEvenHubEvent((event: any) => {
      if (event.textEvent) {
        const code = event.textEvent.eventCode;
        if (code === 0 && onTapCallback) onTapCallback(event.textEvent); // CLICK
        if (code === 3 && onTapCallback) onTapCallback(event.textEvent); // DOUBLE_CLICK
        if ((code === 1 || code === 2) && onScrollCallback)
          onScrollCallback(event.textEvent); // SCROLL
      }
      if (event.listEvent) {
        if (onScrollCallback) onScrollCallback(event.listEvent);
      }
      if (event.audioEvent?.audioPcm) {
        if (onAudioCallback) onAudioCallback(event.audioEvent.audioPcm);
      }
      if (event.sysEvent) {
        const code = event.sysEvent.eventCode;
        if (code === 4) console.log("[Glasses] Foregrounded");
        if (code === 5) console.log("[Glasses] Backgrounded");
        if (code === 6) console.log("[Glasses] Abnormal exit");
      }
    });

    return true;
  } catch (err) {
    console.error("[Glasses] Bridge init failed:", err);
    isConnected = false;
    return false;
  }
}

/**
 * Check if running inside the Even App WebView (bridge available).
 */
export function isEvenApp(): boolean {
  return typeof window !== "undefined" && "EvenAppBridge" in window;
}

/**
 * Display text on the glasses using a full-screen text container.
 */
export function showText(text: string): void {
  if (!bridge) {
    console.log("[Glasses Sim]", text);
    return;
  }

  const formatted = formatText(text);

  try {
    bridge.createStartUpPageContainer({
      containerTotalNum: 1,
      textContainerList: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          containerID: 1,
          containerName: "main",
          content: formatted,
          isEventCapture: 1,
        }),
      ],
    });
  } catch {
    // If page already created, update instead
    updateText(formatted);
  }
}

/**
 * Update text without full page rebuild (avoids flicker).
 */
export function updateText(text: string): void {
  if (!bridge) {
    console.log("[Glasses Sim Update]", text);
    return;
  }

  bridge.textContainerUpgrade({
    containerID: 1,
    containerName: "main",
    content: formatText(text),
  });
}

/**
 * Show a two-zone layout: header + body.
 * Useful for mode indicators + content.
 */
export function showHeaderAndBody(header: string, body: string): void {
  if (!bridge) {
    console.log(`[Glasses Sim] ${header}\n${body}`);
    return;
  }

  bridge.createStartUpPageContainer({
    containerTotalNum: 2,
    textContainerList: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: 40,
        containerID: 1,
        containerName: "header",
        content: header,
        isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 44,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT - 44,
        containerID: 2,
        containerName: "body",
        content: formatText(body),
        isEventCapture: 1,
      }),
    ],
  });
}

/**
 * Show a scrollable list on the glasses.
 * Great for exhibit lists, question queues, etc.
 */
export function showList(
  header: string,
  items: string[],
  selectedIndex: number = 0
): void {
  if (!bridge) {
    console.log(`[Glasses Sim] ${header}\n`, items);
    return;
  }

  bridge.createStartUpPageContainer({
    containerTotalNum: 2,
    textContainerList: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: 36,
        containerID: 1,
        containerName: "header",
        content: header,
        isEventCapture: 0,
      }),
    ],
    listContainerList: [
      new ListContainerProperty({
        xPosition: 0,
        yPosition: 40,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT - 40,
        containerID: 2,
        containerName: "list",
        items: items.slice(0, 20), // max 20 items
        selectedIndex,
        isEventCapture: 1,
      }),
    ],
  });
}

/**
 * Start microphone for voice input.
 */
export function startMic(): void {
  if (bridge) {
    bridge.audioControl(true);
  }
}

/**
 * Stop microphone.
 */
export function stopMic(): void {
  if (bridge) {
    bridge.audioControl(false);
  }
}

/**
 * Register tap/click handler.
 */
export function onTap(callback: EventCallback): void {
  onTapCallback = callback;
}

/**
 * Register scroll handler.
 */
export function onScroll(callback: EventCallback): void {
  onScrollCallback = callback;
}

/**
 * Register audio data handler (mic PCM frames).
 */
export function onAudio(callback: (pcm: Uint8Array) => void): void {
  onAudioCallback = callback;
}

/**
 * Get device info (battery, wearing state, etc).
 */
export async function getDeviceInfo(): Promise<any> {
  if (!bridge) return null;
  return bridge.getDeviceInfo();
}

/**
 * Exit the app on glasses.
 */
export function exitApp(): void {
  if (bridge) {
    bridge.shutDownPageContainer(0);
  }
}

// --- Internal helpers ---

function formatText(text: string): string {
  const inputLines = text.split("\n");
  const wrapped: string[] = [];

  for (const line of inputLines) {
    if (line.length <= MAX_CHARS_PER_LINE) {
      wrapped.push(line);
    } else {
      const words = line.split(" ");
      let current = "";
      for (const word of words) {
        if (current.length + word.length + 1 <= MAX_CHARS_PER_LINE) {
          current = current ? `${current} ${word}` : word;
        } else {
          if (current) wrapped.push(current);
          current =
            word.length > MAX_CHARS_PER_LINE
              ? word.slice(0, MAX_CHARS_PER_LINE)
              : word;
        }
      }
      if (current) wrapped.push(current);
    }
    if (wrapped.length >= MAX_LINES) break;
  }

  return wrapped.slice(0, MAX_LINES).join("\n");
}
