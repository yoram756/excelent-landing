// Logical CRM fields (Lead_Temperature, Niche_Segment, Churn_Reason) derived from a campaign's crmFields block.
// Pure: no transport. Column ids come only from src/config/campaigns/<id>.json; a field whose column is null is computed
// but never written, so nothing reaches Monday until a real column id is configured.
const leadTemperature = (heat, cfg) => {
  if (heat === '' || heat == null) return null;
  const n = Number(heat);
  if (!Number.isFinite(n)) return null;
  const band = cfg.crmFields.leadTemperature.bands.find(b => n >= b.atLeast);
  return band ? band.value : null;
};

// Monday value for the temperature column. With a labels map, only existing board labels are written, and a
// current label that already fits the tier is kept (so "רותח" set by intake is never downgraded to "חם מאוד").
const temperatureValue = (tier, currentLabel, lt) => {
  if (!lt.labels) return tier;
  const l = lt.labels[tier];
  return l.accept.includes(currentLabel || '') ? null : { label: l.write };
};

const crmFields = ({ heat, churnReason, currentLabel }, cfg) => {
  const f = cfg.crmFields;
  const values = {
    Lead_Temperature: leadTemperature(heat, cfg),
    Niche_Segment: f.nicheSegment.value,
    Churn_Reason: churnReason ? String(churnReason).trim() : null
  };
  const columns = {};
  if (f.leadTemperature.column && values.Lead_Temperature) {
    const t = temperatureValue(values.Lead_Temperature, currentLabel, f.leadTemperature);
    if (t) columns[f.leadTemperature.column] = t;
  }
  if (f.nicheSegment.column) columns[f.nicheSegment.column] = values.Niche_Segment;
  if (f.churnReason.column && values.Churn_Reason) columns[f.churnReason.column] = values.Churn_Reason;
  return { values, columns };
};

// This file as an expression the build injects into plan.js; n8n Code nodes cannot require repo files.
const inlineSource = () => '(()=>{const module={exports:{}};\n' + require('fs').readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n') + '\nreturn module.exports;})()';

module.exports = { leadTemperature, crmFields, inlineSource };
