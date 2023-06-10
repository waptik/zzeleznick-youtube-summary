import { init, Tiktoken } from "https://esm.sh/@dqbd/tiktoken@1.0.7/lite/init";
import { load } from "https://esm.sh/@dqbd/tiktoken@1.0.7/load";
import registry from "https://esm.sh/@dqbd/tiktoken@1.0.7/registry.json" assert { type: "json" };
import models from "https://esm.sh/@dqbd/tiktoken@1.0.7/model_to_encoding.json" assert { type: "json" };

type ObjectValues<T> = T[keyof T];
type Registry = Record<ObjectValues<typeof models>, ObjectValues<typeof registry>>;

async function tokenize(text: string) {
    // Initialize the wasm via discussion in https://github.com/dqbd/tiktoken/issues/22
    await init(async (imports) => {
        const req = await fetch('https://esm.sh/@dqbd/tiktoken@1.0.7/lite/tiktoken_bg.wasm')
        return WebAssembly.instantiate(await req.arrayBuffer(), imports)
    });
    // MARK: gpt-3.5-turbo uses the cl100k_base encoding whereas text-davinci-003 uses the p50k_base
    const model = await load((registry as Registry)[models["gpt-3.5-turbo"]]);
    const encoding = new Tiktoken(
        model.bpe_ranks,
        model.special_tokens,
        model.pat_str
    );
    const tokens = encoding.encode(text);
    encoding.free();
    return tokens;
}

if (import.meta.main) {
    const tokens = await tokenize("hello world i'm a teapot");
    console.log(tokens);
    console.log(`Token count: ${tokens.length}`);
}
