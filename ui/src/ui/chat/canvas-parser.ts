import type { CanvasVisualization } from "../components/canvas-visualization";

/**
 * Regex to match canvas code blocks in markdown.
 * Matches ```canvas, ```canvas:title, or ```js:canvas format
 */
const CANVAS_BLOCK_REGEX = /```(?:canvas(?::([^\n]+))?|js:canvas)\n([\s\S]*?)```/g;

/**
 * Alternative format: matches standalone canvas blocks with metadata comment
 * // @canvas title="My Title" description="Description"
 */
const CANVAS_METADATA_REGEX = /\/\/\s*@canvas\s+(?:title="([^"]+)")?(?:\s+description="([^"]+)")?/;

export type ParsedCanvasBlock = {
  code: string;
  title: string;
  description?: string;
  startIndex: number;
  endIndex: number;
};

/**
 * Extracts canvas visualization code blocks from markdown content.
 *
 * Supports the following formats:
 *
 * 1. ```canvas
 *    // code here
 *    ```
 *
 * 2. ```canvas:My Visualization Title
 *    // code here
 *    ```
 *
 * 3. ```js:canvas
 *    // @canvas title="Title" description="Description"
 *    // code here
 *    ```
 *
 * The code should define setup() and/or draw(time) functions:
 *
 * function setup() {
 *   // Runs once at start
 * }
 *
 * function draw(time) {
 *   // Runs every frame, time is seconds since start
 *   utils.clear();
 *   ctx.fillStyle = utils.hsl(time * 60, 80, 50);
 *   ctx.fillRect(100, 100, 200, 200);
 * }
 */
export function extractCanvasBlocks(content: string): ParsedCanvasBlock[] {
  const blocks: ParsedCanvasBlock[] = [];

  let match: RegExpExecArray | null;
  CANVAS_BLOCK_REGEX.lastIndex = 0;

  while ((match = CANVAS_BLOCK_REGEX.exec(content)) !== null) {
    const titleFromFormat = match[1]?.trim();
    const code = match[2].trim();

    // Try to extract metadata from code comment
    const metadataMatch = code.match(CANVAS_METADATA_REGEX);
    const titleFromMetadata = metadataMatch?.[1];
    const description = metadataMatch?.[2];

    // Prefer title from format (```canvas:Title) over metadata comment
    const title = titleFromFormat || titleFromMetadata || generateTitle(code);

    blocks.push({
      code,
      title,
      description,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return blocks;
}

/**
 * Generates a title from the code content if none is provided.
 */
function generateTitle(code: string): string {
  // Look for common patterns
  if (code.includes("particle")) {
    return "Particle Animation";
  }
  if (code.includes("wave") || code.includes("sin")) {
    return "Wave Animation";
  }
  if (code.includes("spiral")) {
    return "Spiral Animation";
  }
  if (code.includes("fractal")) {
    return "Fractal Visualization";
  }
  if (code.includes("chart") || code.includes("graph")) {
    return "Data Chart";
  }
  if (code.includes("physics") || code.includes("velocity")) {
    return "Physics Simulation";
  }
  if (code.includes("noise") || code.includes("perlin")) {
    return "Noise Pattern";
  }
  if (code.includes("circle")) {
    return "Circle Animation";
  }
  if (code.includes("rect")) {
    return "Rectangle Animation";
  }
  if (code.includes("gradient")) {
    return "Gradient Animation";
  }

  return "Canvas Visualization";
}

/**
 * Removes canvas blocks from markdown content, replacing them with
 * a placeholder that can be used to render the visualization inline.
 */
export function replaceCanvasBlocks(
  content: string,
  replacement: (block: ParsedCanvasBlock, index: number) => string,
): string {
  const blocks = extractCanvasBlocks(content);
  let result = content;
  let offset = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const replacementText = replacement(block, i);
    const start = block.startIndex + offset;
    const end = block.endIndex + offset;

    result = result.slice(0, start) + replacementText + result.slice(end);
    offset += replacementText.length - (block.endIndex - block.startIndex);
  }

  return result;
}

/**
 * Checks if content contains any canvas blocks.
 */
export function hasCanvasBlocks(content: string): boolean {
  CANVAS_BLOCK_REGEX.lastIndex = 0;
  return CANVAS_BLOCK_REGEX.test(content);
}

/**
 * Creates a CanvasVisualization from a parsed block.
 */
export function createVisualization(
  block: ParsedCanvasBlock,
  sessionKey: string,
  _messageId?: string,
): CanvasVisualization {
  return {
    id: `viz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: block.title,
    code: block.code,
    description: block.description,
    createdAt: Date.now(),
    sessionKey,
  };
}

/**
 * Extracts all visualizations from a message's content.
 */
export function extractVisualizationsFromMessage(
  message: unknown,
  sessionKey: string,
): CanvasVisualization[] {
  const m = message as Record<string, unknown>;
  const content = m.content;

  let textContent = "";

  if (typeof content === "string") {
    textContent = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          textContent += b.text + "\n";
        }
      }
    }
  }

  const blocks = extractCanvasBlocks(textContent);
  return blocks.map((block) => createVisualization(block, sessionKey));
}
