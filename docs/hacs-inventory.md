# HACS Inventory

This file lists all HACS-managed integrations, Lovelace cards, and downloaded themes used by this Home Assistant instance. These items are excluded from git and must be reinstalled after a fresh restore.

## Integrations

| Name | Path | Repository | Installed Version |
|------|------|------------|-------------------|
| Alexa Media Player | `custom_components/alexa_media` | <https://github.com/alandtse/alexa_media_player> | v5.16.0 |
| Bambu Lab | `custom_components/bambu_lab` | <https://github.com/greghesp/ha-bambulab> | v2.2.26 |
| Extended OpenAI Conversation | `custom_components/extended_openai_conversation` | <https://github.com/jekalmin/extended_openai_conversation> | v2.0.2 |
| HACS | `custom_components/hacs` | <https://github.com/hacs/integration> | v2.0.5 |
| openHASP | `custom_components/openhasp` | <https://github.com/HASwitchPlate/openHASP-custom-component> | v0.7.2 |
| PagerDuty | `custom_components/pagerduty` | <https://github.com/jdrozdnovak/ha_pagerduty> | v1.21.0 |
| UI eXtension (UIX) | `custom_components/uix` | <https://github.com/Lint-Free-Technology/uix> | v8.2.0 |

## Lovelace Cards

| Name | Path | Repository | Installed Version |
|------|------|------------|-------------------|
| Background Graph Entities | `www/community/lovelace-background-graph-entities` | <https://github.com/timmaurice/lovelace-background-graph-entities> | 1.12.0 |
| HA Weather Forecast Card | `www/community/ha-weather-forecast-card` | <https://github.com/troinine/ha-weather-forecast-card> | v1.1.0 |
| Mushroom | `www/community/lovelace-mushroom` | <https://github.com/piitaya/lovelace-mushroom> | v5.2.3 |
| Mushroom Better Sliders | `www/community/lovelace-mushroom-better-sliders` | <https://github.com/phischdev/lovelace-mushroom-better-sliders> | v3.0.2 |
| RadarWise | `www/community/radar-wise` | <https://github.com/TheWillMiller/radar-wise> | v0.8.23 |
| Slider Button Card | `www/community/slider-button-card` | <https://github.com/custom-cards/slider-button-card> | v1.13.0 |
| Swiss Army Knife Card | `www/community/swiss-army-knife-card` | <https://github.com/AmoebeLabs/swiss-army-knife-card> | v2.5.1 |
| Weather Radar Card | `www/community/weather-radar-card` | <https://github.com/jpettitt/weather-radar-card> | v3.7.2 |

## Themes

| Name | Path | Source | Notes |
|------|------|--------|-------|
| Google Dark Theme | `themes/google_dark_theme` | <https://github.com/JuanMTech/Home_Assistant_files> | Manually downloaded; not the `pacjo/google_dark_animated` entry shown in HACS. |

## Restore Procedure

1. Clone this repository into the Home Assistant `/config` directory.
2. Install HACS using the official installer:
   ```bash
   wget -O - https://get.hacs.xyz | bash -
   ```
3. Restart Home Assistant.
4. Open HACS and add each integration above from its repository.
5. Install each Lovelace card above.
6. Copy the Google Dark Theme files into `themes/google_dark_theme/` from the source link.
7. Restart Home Assistant.
8. Re-enter credentials for cloud integrations (Alexa Media Player, Bambu Lab cloud mode if used, Extended OpenAI Conversation, PagerDuty).

## Update Notes

- Run HACS updates through the Home Assistant UI as normal.
- Because these directories are git-ignored, updates will not appear in `git status`.
- Update this file when major versions change or when adding/removing HACS items.
