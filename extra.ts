import { init, Tiktoken } from "https://esm.sh/@dqbd/tiktoken@1.0.7/lite/init";
import { load } from "https://esm.sh/@dqbd/tiktoken@1.0.7/load";
import registry from "https://esm.sh/@dqbd/tiktoken@1.0.7/registry.json" assert { type: "json" };
import models from "https://esm.sh/@dqbd/tiktoken@1.0.7/model_to_encoding.json" assert { type: "json" };

type ObjectValues<T> = T[keyof T];
type Model = keyof typeof models
type Encoder = ObjectValues<typeof models>
type EncoderConfig = ObjectValues<typeof registry>
type Registry = Record<Encoder, EncoderConfig>;

// TODO: support other languages
const BreakWords = [
    "and",
    "but",
    "however",
    "also",
    "so",
    "then",
] as const;

let encoder: Tiktoken;
let breakWordTokens: Set<number>;

async function tokenize(text: string, modelName?: Model) {
    if (!encoder) {
        // Initialize the wasm via discussion in https://github.com/dqbd/tiktoken/issues/22
        await init(async (imports) => {
            const req = await fetch('https://esm.sh/@dqbd/tiktoken@1.0.7/lite/tiktoken_bg.wasm')
            return WebAssembly.instantiate(await req.arrayBuffer(), imports)
        });
    }
    modelName = modelName ?? "gpt-3.5-turbo"
    // MARK: gpt-3.5-turbo uses the cl100k_base encoding whereas text-davinci-003 uses the p50k_base
    const model = await load((registry as Registry)[models[modelName]]);
    encoder = new Tiktoken(
        model.bpe_ranks,
        model.special_tokens,
        model.pat_str
    );
    const tokens = encoder.encode(text);
    encoder.free();
    return tokens;
}

async function tokenizeFillerWords() {
    if (!breakWordTokens) {
        const tokens = await tokenize(BreakWords.join(" "));
        console.log(tokens);
    }
}

if (import.meta.main) {
    // const text = "hello world i'm a teapot";
    // const text = await Deno.readTextFile("./snyk2.log");
    // const tokens = await tokenize(text);
    // console.log(tokens);
    // console.log(`Token count: ${tokens.length}`);
    await tokenizeFillerWords();
}
