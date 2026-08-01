const fs = require('fs');
const path = require('path');

const STORAGE = '/homeassistant/.storage';
const DASH_FILE = path.join(STORAGE, 'lovelace.dashboard_dashboard');
const DASH_IPAD_FILE = path.join(STORAGE, 'lovelace.dashboard_ipad');
const DASHBOARDS_FILE = path.join(STORAGE, 'lovelace_dashboards');
const SOURCE_FILE = path.join(__dirname, 'dashboard-source.json');
const REGISTRY_FILE = path.join(STORAGE, 'core.entity_registry');
const DEVICE_REGISTRY_FILE = path.join(STORAGE, 'core.device_registry');

const current = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
const currentView = current.data.config.views[0];
const currentSections = currentView.sections;

const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
const deviceRegistry = JSON.parse(fs.readFileSync(DEVICE_REGISTRY_FILE, 'utf8'));

// These individual bulbs are already grouped into light.ceiling_fan;
// show only the group on the dashboard.
const EXCLUDED_LIGHTS = [
  'light.third_reality_inc_3rcb01057z',
  'light.third_reality_inc_3rcb01057z_2',
  'light.third_reality_inc_3rcb01057z_3'
];

const lights = registry.data.entities
  .filter(e => e.entity_id.startsWith('light.') && !e.hidden_by && !e.disabled_by && !EXCLUDED_LIGHTS.includes(e.entity_id))
  .map(e => e.entity_id);

// Map Bambu printer serials to friendly names and display order.
const PRINTER_INFO = {
  '01P00A3A0800096': { name: 'P1S UNO', order: 0 },
  '01P00A412300832': { name: 'P1S DOS', order: 1 }
};

function getBambuSerial(device) {
  const id = device.identifiers.find(i => Array.isArray(i) && i[0] === 'bambu_lab');
  return id ? id[1] : null;
}

const bambuDevices = deviceRegistry.data.devices.filter(d => d.manufacturer === 'Bambu Lab');
const printerDevices = bambuDevices.filter(d => d.model === 'P1S');
const amsByPrinter = new Map();
const spoolByPrinter = new Map();
for (const d of bambuDevices) {
  if (d.via_device_id) {
    if (d.model === 'AMS') amsByPrinter.set(d.via_device_id, d.id);
    if (d.model === 'External Spool') spoolByPrinter.set(d.via_device_id, d.id);
  }
}

const printers = printerDevices
  .map(d => {
    const serial = getBambuSerial(d);
    const info = PRINTER_INFO[serial] || { name: d.name, order: 999 };
    return {
      deviceId: d.id,
      serial,
      name: info.name,
      order: info.order,
      ams: amsByPrinter.get(d.id),
      spool: spoolByPrinter.get(d.id)
    };
  })
  .sort((a, b) => a.order - b.order);

// Helper: find the first heading text in a section's cards.
function getHeading(section) {
  const heading = section.cards.find(c => c.type === 'heading');
  return heading ? heading.heading : null;
}

// Build a map of original sections by heading.
const byHeading = {};
for (const section of currentSections) {
  const h = getHeading(section);
  if (h) byHeading[h] = section;
}

// Split the Office section into its parts.
const officeSection = byHeading['Office'];
const officeHeading = officeSection.cards.find(c => c.type === 'heading');
const officeNetwork = officeSection.cards.find(c => c.type === 'entities');
const officeMedia = officeSection.cards.find(c => c.type === 'tile' && c.entity && c.entity.startsWith('media_player.'));
const officeLight = officeSection.cards.find(c => c.type === 'custom:mushroom-light-card');

function headingCard(heading, icon) {
  return {
    type: 'heading',
    heading,
    heading_style: 'title',
    icon
  };
}

function makeGrid(cards, columnSpan = 1) {
  return {
    type: 'grid',
    cards,
    column_span: columnSpan
  };
}

function makeSection(heading, icon, columnSpan, cards) {
  return makeGrid([headingCard(heading, icon), ...cards], columnSpan);
}

function buildPrinterSection(printer, columnSpan) {
  const cards = [
    {
      type: 'custom:ha-bambulab-print_status-card',
      printer: printer.deviceId
    },
    {
      type: 'custom:ha-bambulab-print_control-card',
      printer: printer.deviceId
    }
  ];
  if (printer.ams) {
    cards.push({
      type: 'custom:ha-bambulab-ams-card',
      ams: printer.ams,
      style: 'vector'
    });
  }
  if (printer.spool) {
    cards.push({
      type: 'custom:ha-bambulab-spool-card',
      spool: printer.spool
    });
  }
  return makeSection(printer.name, 'mdi:printer-3d-nozzle', columnSpan, cards);
}

// Common header for the Home view.
const homeHeader = {
  type: 'header',
  badges: [
    { type: 'entity', entity: 'person.woteg', show_name: false },
    { type: 'entity', entity: 'device_tracker.traviss_iphone', show_name: false },
    { type: 'entity', entity: 'weather.forecast_home', show_name: false }
  ],
  card: {
    type: 'markdown',
    content: '# Home'
  }
};

function buildViews(maxColumns) {
  return [
    {
      type: 'sections',
      title: 'Home',
      icon: 'mdi:home',
      path: 'home',
      max_columns: maxColumns,
      theme: 'Google Dark Theme',
      show_icon_and_title: false,
      header: homeHeader,
      sections: [
        byHeading['Home'],
        makeSection('Media', 'mdi:television', 1, [officeMedia])
      ]
    },
    {
      type: 'sections',
      title: 'Lights',
      icon: 'mdi:lightbulb',
      path: 'lights',
      max_columns: maxColumns,
      theme: 'Google Dark Theme',
      show_icon_and_title: false,
      sections: [
        makeSection('Lights', 'mdi:lightbulb-multiple', 1, [
          officeLight,
          ...lights
            .filter(id => id !== officeLight.entity)
            .map(id => ({
              type: 'tile',
              entity: id,
              grid_options: { columns: 6, rows: 'auto' }
            }))
        ])
      ]
    },
    {
      type: 'sections',
      title: 'Security',
      icon: 'mdi:shield-home',
      path: 'security',
      max_columns: maxColumns,
      theme: 'Google Dark Theme',
      show_icon_and_title: false,
      sections: [
        byHeading['Outside']
      ]
    },
    {
      type: 'sections',
      title: 'Environment',
      icon: 'mdi:thermometer-lines',
      path: 'environment',
      max_columns: maxColumns,
      theme: 'Google Dark Theme',
      show_icon_and_title: false,
      sections: [
        byHeading['Bedroom'],
        byHeading['Basement'],
        byHeading['Weather']
      ]
    },
    {
      type: 'sections',
      title: 'Printers',
      icon: 'mdi:printer-3d-nozzle',
      path: 'printers',
      max_columns: maxColumns,
      theme: 'Google Dark Theme',
      show_icon_and_title: false,
      sections: printers.map(p => buildPrinterSection(p, maxColumns === 3 ? 1 : 2))
    },
    {
      type: 'sections',
      title: 'System',
      icon: 'mdi:cog',
      path: 'system',
      max_columns: maxColumns,
      theme: 'Google Dark Theme',
      show_icon_and_title: false,
      sections: [
        makeSection('Network', 'mdi:network', 1, [officeNetwork]),
        byHeading['PI'],
        byHeading['Cleaning']
      ]
    }
  ];
}

function makeDashboard(key, maxColumns) {
  return {
    version: 1,
    minor_version: 1,
    key,
    data: {
      config: {
        views: buildViews(maxColumns)
      }
    }
  };
}

const webDashboard = makeDashboard('lovelace.dashboard_dashboard', 3);
const ipadDashboard = makeDashboard('lovelace.dashboard_ipad', 2);

fs.writeFileSync(DASH_FILE, JSON.stringify(webDashboard, null, 2));
fs.writeFileSync(DASH_IPAD_FILE, JSON.stringify(ipadDashboard, null, 2));

// Update dashboards registry.
const dashboards = JSON.parse(fs.readFileSync(DASHBOARDS_FILE, 'utf8'));
const items = dashboards.data.items;

const existing = items.find(i => i.id === 'dashboard_dashboard');
if (existing) {
  existing.title = 'Web';
  existing.url_path = 'web';
  existing.icon = 'mdi:monitor';
}

if (!items.find(i => i.id === 'dashboard_ipad')) {
  items.push({
    id: 'dashboard_ipad',
    show_in_sidebar: true,
    icon: 'mdi:tablet',
    title: 'iPad',
    require_admin: false,
    mode: 'storage',
    url_path: 'ipad'
  });
}

fs.writeFileSync(DASHBOARDS_FILE, JSON.stringify(dashboards, null, 2));

console.log('Generated Web dashboard:', DASH_FILE);
console.log('Generated iPad dashboard:', DASH_IPAD_FILE);
console.log('Updated dashboards registry:', DASHBOARDS_FILE);
