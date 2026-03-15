/** shared contract lives in packages/protocol */
module.exports = {
  forbidden: [
    {
      name: "web-to-gateway",
      comment: "apps/web/src must not import apps/gateway/src",
      severity: "error",
      from: { path: "^apps/web/src" },
      to: { path: "^apps/gateway/src" }
    },
    {
      name: "gateway-to-web",
      comment: "apps/gateway/src must not import apps/web/src",
      severity: "error",
      from: { path: "^apps/gateway/src" },
      to: { path: "^apps/web/src" }
    },
    {
      name: "apps-to-tests",
      comment: "production app code must not import tests",
      severity: "error",
      from: { path: "^apps/(web|gateway)/src" },
      to: { path: "^tests/" }
    },
    {
      name: "apps-to-scripts",
      comment: "production app code must not import scripts",
      severity: "error",
      from: { path: "^apps/(web|gateway)/src" },
      to: { path: "^scripts/" }
    }
  ],
  options: {
    tsConfig: {
      fileName: "tsconfig.base.json"
    },
    doNotFollow: {
      path: "(^node_modules)|(^apps/web/public/vendor)"
    },
    exclude: {
      path: "(^node_modules)|(^apps/web/public/vendor)|(^coverage)|(^dist)|(^output)"
    }
  }
};
