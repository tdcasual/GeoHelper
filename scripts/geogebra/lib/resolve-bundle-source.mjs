const BUNDLE_FILENAME_PATTERN = /^geogebra-math-apps-bundle-(\d+)-(\d+)-(\d+)-(\d+)\.zip$/;

export const parseBundleSource = (url) => {
  const sourceUrl = new URL(url);
  const filename = sourceUrl.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const match = BUNDLE_FILENAME_PATTERN.exec(filename);

  if (!match) {
    throw new Error(`Unable to parse GeoGebra bundle version from source: ${url}`);
  }

  const [, major, minor, patch, build] = match;

  return {
    url: sourceUrl.toString(),
    filename,
    version: `${major}.${minor}.${patch}.${build}`
  };
};

export const resolveBundleSource = async (
  fetchImpl,
  latestBundleUrl
) => {
  const response = await fetchImpl(latestBundleUrl, {
    method: "GET",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve GeoGebra bundle source: ${response.status}`);
  }

  return parseBundleSource(response.url);
};
