# Contributing

Thanks for your interest!

## Issues are welcome

Found a bug, a wrong number, or something confusing? Have an idea, or a use case this
doesn't cover? Please [open an issue](https://github.com/kbuksakowski/ai-unit-economics/issues).
At this early stage, hearing how you track AI cost — and where this tool falls short — is
the most useful contribution there is.

## Pull requests are not accepted for now

This project is written by one person, and for now all code is written by the maintainer.
Pull requests will be closed without review — please open an issue instead, and describe the
problem or the change you'd like to see.

This may change as the project grows.

## Security

Please don't report vulnerabilities in public issues — see [SECURITY.md](.github/SECURITY.md).

## Building from source

Requirements: Node 24, pnpm 11, Docker.

```sh
pnpm install
docker compose up -d   # MariaDB, bound to this machine
pnpm build             # tests read the built packages
pnpm test              # the API tests use a separate, recreated database
```

## Licence

The code is licensed under [Apache-2.0](LICENSE): you are free to use, modify and
redistribute it, including commercially, under its terms.
