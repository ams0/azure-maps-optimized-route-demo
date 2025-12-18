export interface Location {
  lat: number;
  lon: number;
}

export interface RouteSummary {
  lengthInMeters: number;
  travelTimeInSeconds: number;
  trafficDelayInSeconds: number;
  departureTime: string;
  arrivalTime: string;
}

export interface RouteResponse {
  routeSummary: RouteSummary;
}

export interface MatrixCell {
  statusCode: number;
  response?: RouteResponse;
}

export interface RouteMatrixResult {
  formatVersion: string;
  matrix: MatrixCell[][];
  summary: {
    successfulRoutes: number;
    totalRoutes: number;
  };
}
