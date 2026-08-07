# Design: Switch Voice Pipeline from Kimi to Native Home Assistant Assist

## Context

- Home Assistant version: `2026.8.0`
- Current voice pipeline: `Home Assistant`
  - STT: `stt.faster_whisper` (Whisper add-on)
  - Conversation: `conversation.extended_openai_conversation` configured to call **Kimi** via `https://api.kimi.com/coding/v1`
  - TTS: `tts.piper` (Piper add-on)
  - Wake word: `wake_word.openwakeword` (`okay_nabu`)
- The user reports the Kimi/OpenAI-based conversation agent "never really worked" and wants to default to the new native Home Assistant voice/Assist experience.

## Goal

Repoint the existing voice pipeline to use Home Assistant's built-in conversation engine (`conversation.home_assistant`) and remove the now-unused `extended_openai_conversation` / Kimi config entry.

## Approach

Use the **direct `.storage` edit** path (user-selected) because the files are accessible in this configuration directory and the change is small and well-scoped. The recommended UI path is documented as a fallback.

## Files to Change

1. `/config/.storage/assist_pipeline.pipelines`
   - Change `conversation_engine` from `conversation.extended_openai_conversation` to `conversation.home_assistant`.
2. `/config/.storage/core.config_entries`
   - Remove the config entry whose `domain` is `extended_openai_conversation` (title `Kimi`).

## Backup and Rollback

- Before editing, create timestamped backups of both `.storage` files.
- Rollback: restore the backed-up files and restart Home Assistant.

## Procedure

1. Stop Home Assistant if possible, or proceed during a quiet period (`.storage` edits are most reliable when HA is not actively writing these files).
2. Back up:
   - `/config/.storage/assist_pipeline.pipelines`
   - `/config/.storage/core.config_entries`
3. Edit `assist_pipeline.pipelines`:
   - Locate the `Home Assistant` pipeline item.
   - Set `"conversation_engine": "conversation.home_assistant"`.
4. Edit `core.config_entries`:
   - Locate the entry with `"domain": "extended_openai_conversation"`.
   - Remove the entire object from the `data.entries` array.
   - Ensure valid JSON remains (commas, brackets).
5. Validate JSON syntax for both files.
6. Restart Home Assistant.
7. Verify:
   - `Settings > Voice assistants > Manage` shows **Conversation agent: Home Assistant**.
   - `Settings > Devices & services` no longer lists the Kimi / `extended_openai_conversation` integration.
   - Voice commands (e.g., "Hey Nabu, what's the weather?") respond via native Assist.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| HA overwrites `.storage` while editing | Edit during low activity; stop HA first if feasible; keep backups. |
| Invalid JSON after removing config entry | Validate JSON before restarting; restore backup if validation fails. |
| Pipelines/devices still reference removed conversation engine | The only reference is in the pipeline being updated; verify after restart. |

## Future Cleanup (Optional)

- The `custom_components/extended_openai_conversation/` directory can be removed later via HACS or manually once the config entry is gone and the native pipeline is confirmed working.

## UI Fallback

If the direct edit fails or is uncomfortable:
1. `Settings > Voice assistants > Manage > Home Assistant` → set **Conversation agent** to **Home Assistant**.
2. `Settings > Devices & services > extended_openai_conversation` → delete the Kimi entry.
3. Restart Home Assistant.
