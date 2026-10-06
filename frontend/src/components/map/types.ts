export type ReportCategory = 'pothole' | 'flooding' | 'construction';

export interface MapReport {
  id: string;
  category: ReportCategory;
  title: string;
  description: string;
  position: readonly [latitude: number, longitude: number];
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}
