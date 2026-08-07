# Switch Voice Pipeline to Native Assist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repoint the Home Assistant voice pipeline from Kimi (`extended_openai_conversation`) to the native `conversation.home_assistant` engine and remove the Kimi config entry.

**Architecture:** Modify two Home Assistant runtime registry files in `/config/.storage/`: change the pipeline's `conversation_engine` in `assist_pipeline.pipelines`, and remove the `extended_openai_conversation` entry from `core.config_entries`. Keep Whisper STT, Piper TTS, and openwakeword unchanged.

**Tech Stack:** Home Assistant 2026.8.0, JSON registry files, Bash/Python for validation.

## Global Constraints

- Work only on `/config/.storage/assist_pipeline.pipelines` and `/config/.storage/core.config_entries`.
- Keep Whisper (`stt.faster_whisper`), Piper (`tts.piper`), and openwakeword unchanged.
- Do not delete the `custom_components/extended_openai_conversation/` directory in this plan.
- Create timestamped backups before editing any `.storage` file.
- Validate JSON syntax before declaring a task complete.
- The user must restart Home Assistant after the edits; do not attempt to restart services from this environment.

---

### Task 1: Back up the `.storage` files

**Files:**
- Read: `/config/.storage/assist_pipeline.pipelines`
- Read: `/config/.storage/core.config_entries`
- Create: `/config/.storage/assist_pipeline.pipelines.bak.<timestamp>`
- Create: `/config/.storage/core.config_entries.bak.<timestamp>`

**Interfaces:**
- Consumes: Current runtime state of the two registry files.
- Produces: Timestamped backups that can be restored for rollback.

- [ ] **Step 1: Create timestamped backups**

Run:
```bash
TS=$(date +%Y%m%d_%H%M%S)
cp /config/.storage/assist_pipeline.pipelines /config/.storage/assist_pipeline.pipelines.bak.${TS}
cp /config/.storage/core.config_entries /config/.storage/core.config_entries.bak.${TS}
echo "Backups created with timestamp ${TS}"
```

- [ ] **Step 2: Verify backups exist**

Run:
```bash
ls -la /config/.storage/assist_pipeline.pipelines.bak.* /config/.storage/core.config_entries.bak.*
```

Expected: Two backup files listed with the same timestamp.

- [ ] **Step 3: Note backup location**

The backups live next to the source files in `/config/.storage/`. Because `.storage/` is gitignored, these backups are not tracked by git; they are local rollback copies only.

---

### Task 2: Change the voice pipeline conversation engine

**Files:**
- Modify: `/config/.storage/assist_pipeline.pipelines`

**Interfaces:**
- Consumes: Backup from Task 1.
- Produces: Pipeline JSON with `"conversation_engine": "conversation.home_assistant"`.

- [ ] **Step 1: Read the current pipeline file**

Read `/config/.storage/assist_pipeline.pipelines` and confirm the current value is `"conversation_engine": "conversation.extended_openai_conversation"`.

- [ ] **Step 2: Replace the conversation engine string**

Run:
```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/config/.storage/assist_pipeline.pipelines')
data = json.loads(p.read_text())
for item in data['data']['items']:
    if item.get('name') == 'Home Assistant':
        item['conversation_engine'] = 'conversation.home_assistant'
p.write_text(json.dumps(data, indent=2) + '\n')
print('conversation_engine updated to conversation.home_assistant')
PY
```

- [ ] **Step 3: Validate JSON syntax**

Run:
```bash
python3 -m json.tool /config/.storage/assist_pipeline.pipelines > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`

- [ ] **Step 4: Verify the change**

Run:
```bash
grep -A2 -B2 '"conversation_engine"' /config/.storage/assist_pipeline.pipelines
```

Expected: `"conversation_engine": "conversation.home_assistant"`

---

### Task 3: Remove the Kimi / `extended_openai_conversation` config entry

**Files:**
- Modify: `/config/.storage/core.config_entries`

**Interfaces:**
- Consumes: Backup from Task 1.
- Produces: `core.config_entries` without the `extended_openai_conversation` domain entry.

- [ ] **Step 1: Confirm the entry to remove**

Run:
```bash
grep -n '"domain": "extended_openai_conversation"' /config/.storage/core.config_entries
```

Expected: Exactly one matching line.

- [ ] **Step 2: Remove the entry while preserving valid JSON**

Run:
```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/config/.storage/core.config_entries')
data = json.loads(p.read_text())
original_count = len(data['data']['entries'])
data['data']['entries'] = [e for e in data['data']['entries'] if e.get('domain') != 'extended_openai_conversation']
new_count = len(data['data']['entries'])
p.write_text(json.dumps(data, indent=2) + '\n')
print(f'Removed {original_count - new_count} extended_openai_conversation entry(ies)')
PY
```

Expected: `Removed 1 extended_openai_conversation entry(ies)`

- [ ] **Step 3: Validate JSON syntax**

Run:
```bash
python3 -m json.tool /config/.storage/core.config_entries > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`

- [ ] **Step 4: Verify the entry is gone**

Run:
```bash
grep -c '"domain": "extended_openai_conversation"' /config/.storage/core.config_entries
```

Expected: `0`

---

### Task 4: Final review and handoff

**Files:**
- Read: `/config/.storage/assist_pipeline.pipelines`
- Read: `/config/.storage/core.config_entries`

**Interfaces:**
- Consumes: Modified registry files from Tasks 2 and 3.
- Produces: User instructions for restart and verification.

- [ ] **Step 1: Show a concise diff summary**

Run:
```bash
diff /config/.storage/assist_pipeline.pipelines.bak.* /config/.storage/assist_pipeline.pipelines
echo "---"
diff /config/.storage/core.config_entries.bak.* /config/.storage/core.config_entries | head -40
```

Expected: First diff shows only the `conversation_engine` value changed. Second diff shows only the removed `extended_openai_conversation` block.

- [ ] **Step 2: Instruct the user to restart Home Assistant**

Restart Home Assistant using the user's normal method (e.g., **Settings > System > Restart** or the restart button in the UI).

- [ ] **Step 3: Instruct the user to verify**

After restart, confirm:
1. `Settings > Voice assistants > Manage` shows **Conversation agent: Home Assistant**.
2. `Settings > Devices & services` no longer lists a Kimi / `extended_openai_conversation` entry.
3. A voice command such as "Hey Nabu, what's the weather?" returns a response.

- [ ] **Step 4: Document completion**

Update the plan file or a short note indicating the edits were applied and are pending user restart.
