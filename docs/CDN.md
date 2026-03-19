# CDN Distribution

Holi release artifacts can be consumed directly from a free CDN by publishing the package to npm and referencing the built files from jsDelivr or unpkg.

## Recommended Flow

1. Create and push a release tag such as `v0.1.5`.
2. Let GitHub Actions publish the package to npm.
3. Reference the versioned `dist` assets from jsDelivr in application pages.

The repository includes a publish workflow at `.github/workflows/publish-npm.yml`. It runs on pushed version tags and publishes the package with provenance enabled.

## Required Repository Setup

- Add an `NPM_TOKEN` repository secret with publish access to the target npm package or scope.
- Ensure the npm package name in `package.json` is available to your account or organization.
- For this repository, the package name is `@saasira/holi`, so the npm token should be allowed to publish within the `@saasira` scope.
- Push semantic version tags in the form `vX.Y.Z`.

## Recommended CDN

Use jsDelivr for primary distribution because it serves individual files from npm packages and supports immutable versioned URLs.

Pattern:

```text
https://cdn.jsdelivr.net/npm/<package-name>@<version>/<file>
```

For Holi `v0.1.5`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@saasira/holi@0.1.5/dist/holi.css" />
<script src="https://cdn.jsdelivr.net/npm/@saasira/holi@0.1.5/dist/holi.js"></script>
<link rel="preload" as="fetch" href="https://cdn.jsdelivr.net/npm/@saasira/holi@0.1.5/dist/components.html" crossorigin="anonymous" />
```

## Fallback CDN

unpkg can be used with the same package versioning model:

```html
<link rel="stylesheet" href="https://unpkg.com/@saasira/holi@0.1.5/dist/holi.css" />
<script src="https://unpkg.com/@saasira/holi@0.1.5/dist/holi.js"></script>
<link rel="preload" as="fetch" href="https://unpkg.com/@saasira/holi@0.1.5/dist/components.html" crossorigin="anonymous" />
```

## Versioning Guidance

- Pin exact versions such as `0.1.5` for production applications.
- Avoid `latest` for application pages because it makes releases non-repeatable.
- Keep the git tag, `package.json` version, and published npm version aligned.

## What Gets Published

The npm package is configured to publish:

- `dist/holi.js`
- `dist/holi.css`
- `dist/components.html`
- `dist/layouts.html`
- `dist/holi.html` (legacy compatibility bundle)
- `README.md`
- `CHANGELOG.md`
