// A small synthetic repository that satisfies every check of tools/lib/release-checks.mjs. Self-test mode breaks it one way per check
// (the check's `fixture.mutate`) and requires that exact check to fail; the unbroken tree is the control that must pass.
// Hashes here are made up and self-consistent; nothing in this file describes the real environment.
import { sha256 } from './release-checks.mjs';
import { buildSnapshot } from './openapi.mjs';

export const GOLDEN_LICENSE = 'MIT License\n\nCopyright (c) 2026 lodmaome\n\nPermission is hereby granted (golden test text, not a real licence body).\n';

export function goldenTree() {
  const t = new Map();
  const sha = 'a'.repeat(40);
  const digest = `sha256:${'b'.repeat(64)}`;
  const gate = `sha256:${'c'.repeat(64)}`;
  const reqLock = '# lock\nfoo==1 --hash=sha256:xx\n';
  const toolsLock = '# build tools\nbar==2\n';
  t.set('compose.yaml', 'name: conduit-env\ninclude:\n  - path: env/stack.yaml\n');
  t.set('env/OWNED.txt', '# owned\ncompose.yaml\nenv/**\ntools/**\ndocs/env/**\n.github/workflows/env-*.yml\n');
  t.set('env/SEED.txt', '# seeds\nREADME.md\nLICENSE\ndocs/attempt/.gitkeep\n');
  t.set('env/pins.env', `BACKEND_SHA=${sha}\nPYTHON_IMAGE=python:3.12@${digest}\n`);
  t.set('env/gate/tools.env', `SHELLCHECK_IMAGE=koalaman/shellcheck:v1@${gate}\n`);
  t.set('env/stack.yaml', 'services:\n  db:\n    environment:\n      POSTGRES_PASSWORD: "0000"\n  api:\n    image: x:${BACKEND_SHA}\n    build:\n      args:\n        PYTHON_IMAGE: ${PYTHON_IMAGE}\n    environment:\n      DATABASE_URL: postgresql://postgres:0000@db:5432/postgres\n');
  t.set('tools/gate.sh', '#!/bin/sh\necho "$SHELLCHECK_IMAGE"\n');
  t.set('env/.gitattributes', '* text eol=lf\n');
  t.set('tools/.gitattributes', '* text eol=lf\n');
  t.set('env/backend/requirements.lock.txt', reqLock);
  t.set('env/backend/build-tools.lock.txt', toolsLock);
  const header = [`backend-sha7: ${sha.slice(0, 7)}`, `requirements-lock-sha256: ${sha256(reqLock)}`, `build-tools-lock-sha256: ${sha256(toolsLock)}`];
  t.set(`docs/env/contract/openapi.${sha.slice(0, 7)}.json`, buildSnapshot('{"openapi":"3.1.0","paths":{}}', `${header.join('\n')}\n`));
  t.set('docs/env/third-party/python-licences.txt', `requirements-lock-sha256: ${sha256(reqLock)}\nfoo 1 MIT\n`);
  t.set('docs/env/THIRD-PARTY.md', `| Name | Pin |\n|---|---|\n| \`BACKEND_SHA\` | backend | ${sha.slice(0, 12)} |\n| \`PYTHON_IMAGE\` | python | python ${'b'.repeat(12)} |\n| \`SHELLCHECK_IMAGE\` | shellcheck | koalaman/shellcheck ${'c'.repeat(12)} |\n`);
  t.set('docs/env/reset-and-boot.md', '# Reset\nuse tools/reset.sh\n');
  t.set('docs/env/WORKING-AGREEMENT.md', '# Working agreement\n\nall written.\n');
  t.set('docs/env/adr/0001-pair-lock-and-migrations.md', 'Record document: the old file was called constraints.txt.\n');
  t.set('docs/env/CHANGELOG.md', '# Changelog\n\n## env-v1 - 2026-01-01\n\n- class: pin, docs\n- merge: required\n');
  t.set('docs/attempt/.gitkeep', '');
  t.set('README.md', '# conduit-env\n');
  t.set('LICENSE', GOLDEN_LICENSE);
  t.set('tools/x.sh', '#!/bin/sh\necho hi\n');
  return t;
}

export const GOLDEN_PORTS = { services: { frontend: { ports: [{ host_ip: '127.0.0.1', published: '4180' }] }, api: { ports: [{ host_ip: '127.0.0.1', published: '4181' }] }, db: { ports: [{ host_ip: '127.0.0.1', published: '4182' }] } } };
