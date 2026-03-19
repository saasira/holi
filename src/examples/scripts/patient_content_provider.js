
class PatientContentProvider extends ContentProvider {
    static get name() { return 'patient'; }
    
    constructor(state) {
        super();
        this.patientState = state; // FHIR data, app state, etc.
    }
    
    resolve(dataSourceExpr) {
        const path = dataSourceExpr.slice(2, -1); // "@{patient.addresses}" → "patient.addresses"
        
        if (path === 'patient.addresses') {
            return this.patientState.addresses.map(addr => ({
                label: addr.use || addr.line?.[0] || 'Address',
                id: addr.id,
                contentUrl: `/fhir/Address/${addr.id}/html`
            }));
        }
        
        if (path === 'patient.encounters') {
            return this.patientState.encounters.map(enc => ({
                label: enc.status,
                id: enc.id,
                contentUrl: `/fhir/Encounter/${enc.id}/summary`
            }));
        }
        
        return [];
    }
    
    async getContent(itemData, index) {
        if (itemData.contentUrl) {
            const response = await fetch(itemData.contentUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${itemData.contentUrl}: ${response.status}`);
            }
            return await response.text();
        }
        
        // Inline content fallback
        return `<div>${itemData.label} details</div>`;
    }
}

