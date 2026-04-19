const helperConfig = {
  BRIDGE_SOURCE: "generals-helper-ws-hook",
  PANEL_ID: "generals-helper-panel-root",
  REFRESH_MS: 1500,
  INIT_FLAG: "__generalsHelperContentInitialized",
  MODE_RAW: "raw",
  MODE_BATTLE: "battle",
  PLAYER_COLORS: [
    "rgb(255, 0, 0)",
    "rgb(39, 146, 255)",
    "rgb(0, 128, 0)",
    "rgb(0, 128, 128)",
    "rgb(250, 140, 1)",
    "rgb(240, 50, 230)",
    "rgb(127, 0, 127)",
    "rgb(155, 1, 1)",
    "rgb(179, 172, 50)",
    "rgb(154, 94, 36)",
    "rgb(16, 49, 255)",
    "rgb(89, 76, 165)",
    "rgb(133, 169, 28)",
    "rgb(255, 102, 104)",
    "rgb(180, 127, 202)",
    "rgb(180, 153, 113)"
  ],
  BATTLE_DISPLAY_CONFIG: {
    showTurn: true,
    showPlayers: false,
    showMapDiff: true,
    showCitiesDiff: false,
    showDesertsDiff: false,
    showDebug: false
  }
};

export default Object.freeze(helperConfig);

