# Register Your Entity Secret

## Generate an entity secret

```ts
import { generateEntitySecret } from "@circle-fin/developer-controlled-wallets";

generateEntitySecret();
```

Prints a new 32-byte hex entity secret to the console and returns nothing. Copy the printed value into `ENTITY_SECRET`.

## Register entity secret ciphertext

```ts
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const recoveryDir = path.join(os.homedir(), ".circle");
fs.mkdirSync(recoveryDir, { recursive: true });

const response = await registerEntitySecretCiphertext({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
  recoveryFileDownloadPath: recoveryDir,
});

console.log(response.data?.recoveryFile);
```

`recoveryFileDownloadPath` is a directory (default: the current working directory); the SDK writes `recovery_file_<uuid>.dat` into it but does not create it, so create it first.

## Reference Links

- [Register Entity Secret](https://developers.circle.com/wallets/dev-controlled/register-entity-secret)
- [Entity Secret Management](https://developers.circle.com/wallets/dev-controlled/entity-secret-management)
