import { Client } from '../mdctl-api'

export class StudyManifestTools {

    constructor(client: Client, options: Object)
    getStudyManifest(manifest?: string): Promise<{
        manifest: unknown
        removedEntities: unknown
        mappingScript: unknown
        ingestTransform: string
    }>

}