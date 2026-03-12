# Register Your Entity Secret

Use these TypeScript snippets to generate and register your entity secret. Keep the secret and recovery file secure.

## Generate an entity secret

```ts
import { generateEntitySecret } from "@circle-fin/developer-controlled-wallets";

generateEntitySecret();
```

Generates a 32-byte entity secret for developer-controlled wallet signing.

## Register entity secret ciphertext

```ts
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import os from "node:os";
import path from "node:path";

const response = await registerEntitySecretCiphertext({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
  recoveryFileDownloadPath: path.join(os.homedir(), ".circle", "recovery-file.json"),
});

console.log(response.data?.recoveryFile);
```

Registers ciphertext with Circle and writes a recovery file to the provided path.

## Security notes

- Never commit `ENTITY_SECRET` or recovery files.
- Store both in secure secret storage.
- SDK methods that require ciphertext will handle generation/rotation for each request.
