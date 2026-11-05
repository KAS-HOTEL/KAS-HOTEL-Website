export interface SiteImageSlot {
  readonly key: string;
  readonly group: string;
  readonly label: string;
  readonly selector: string;
  readonly defaultReference: string;
  readonly currentReference: string | null;
  readonly imageReference: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
}
