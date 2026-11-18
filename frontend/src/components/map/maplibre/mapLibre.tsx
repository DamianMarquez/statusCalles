import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Map as MapLibreMap, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapConfig } from '../mapConfig.js';

const MapContext = createContext<MapLibreMap | null>(null);

/** Mapa ya cargado (estilo listo). Solo se usa dentro de <MapCanvas>. */
export function useMapInstance(): MapLibreMap {
  const map = useContext(MapContext);
  if (!map) throw new Error('useMapInstance debe usarse dentro de <MapCanvas>.');
  return map;
}

export interface MapClickEvent {
  lat: number;
  lng: number;
}

/** Suscribe eventos del mapa; los handlers pueden cambiar sin re-suscribir. */
export function useMapEvents(handlers: {
  moveend?: () => void;
  zoomend?: () => void;
  click?: (event: MapClickEvent) => void;
}): MapLibreMap {
  const map = useMapInstance();
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const onMoveEnd = () => latest.current.moveend?.();
    const onZoomEnd = () => latest.current.zoomend?.();
    const onClick = (event: { lngLat: { lat: number; lng: number } }) =>
      latest.current.click?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    map.on('moveend', onMoveEnd);
    map.on('zoomend', onZoomEnd);
    map.on('click', onClick);
    return () => {
      map.off('moveend', onMoveEnd);
      map.off('zoomend', onZoomEnd);
      map.off('click', onClick);
    };
  }, [map]);
  return map;
}

/** Acerca el mapa a un punto sin alejarlo si ya está más cerca. */
export function focusMap(map: MapLibreMap, latitude: number, longitude: number, minZoom = 16) {
  map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), minZoom) });
}

export function MapCanvas({
  children,
  className,
  center = mapConfig.center,
  zoom = mapConfig.zoom,
  minZoom = mapConfig.minZoom,
  maxZoom = mapConfig.maxZoom,
  maxBounds = mapConfig.maxBounds,
  scrollZoom = true,
}: {
  children?: ReactNode;
  className?: string;
  center?: [number, number];
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  maxBounds?: [[number, number], [number, number]] | undefined;
  scrollZoom?: boolean;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  // Las props son valores iniciales: el mapa se crea una sola vez.
  useEffect(() => {
    if (!host.current) return;
    const instance = new MapLibreMap({
      container: host.current,
      style: mapConfig.style,
      center,
      zoom,
      minZoom,
      maxZoom,
      ...(maxBounds ? { maxBounds } : {}),
      scrollZoom,
      attributionControl: { compact: true },
    });
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    let disposed = false;
    instance.on('load', () => {
      if (disposed) return;
      // El contenedor puede haber cambiado de tamaño entre el montaje y la carga del estilo.
      instance.resize();
      setMap(instance);
    });
    if (import.meta.env.DEV)
      (window as unknown as { __streetMap?: MapLibreMap }).__streetMap = instance;
    return () => {
      disposed = true;
      setMap(null);
      instance.remove();
    };
  }, []);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {map ? <MapContext.Provider value={map}>{children}</MapContext.Provider> : null}
    </div>
  );
}

/** Marcador con HTML propio y popup opcional con contenido React. */
export function MapMarker({
  position,
  className,
  html,
  size,
  anchor = 'bottom',
  offset,
  zIndex,
  popup,
  popupMaxWidth = '320px',
  onPopupToggle,
}: {
  position: [number, number]; // [latitud, longitud]
  className: string;
  html: string;
  size: [number, number];
  anchor?: 'center' | 'bottom';
  offset?: [number, number];
  zIndex?: number;
  popup?: ReactNode;
  popupMaxWidth?: string;
  onPopupToggle?: (open: boolean) => void;
}) {
  const map = useMapInstance();
  const [popupHost] = useState(() => document.createElement('div'));
  const [popupOpen, setPopupOpen] = useState(false);
  const markerRef = useRef<Marker | null>(null);
  const hasPopup = popup !== undefined;
  const toggle = useRef(onPopupToggle);
  useEffect(() => {
    toggle.current = onPopupToggle;
  });

  useEffect(() => {
    const element = document.createElement('div');
    element.className = className;
    element.innerHTML = html;
    element.style.width = `${size[0]}px`;
    element.style.height = `${size[1]}px`;
    if (zIndex !== undefined) element.style.zIndex = String(zIndex);
    const marker = new Marker({ element, anchor, ...(offset ? { offset } : {}) });
    marker.setLngLat([position[1], position[0]]);
    if (hasPopup) {
      const popupInstance = new Popup({ maxWidth: popupMaxWidth, offset: 12 }).setDOMContent(
        popupHost,
      );
      popupInstance.on('open', () => {
        setPopupOpen(true);
        toggle.current?.(true);
      });
      popupInstance.on('close', () => {
        setPopupOpen(false);
        toggle.current?.(false);
      });
      marker.setPopup(popupInstance);
    }
    marker.addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // La posición se actualiza aparte para no recrear el marcador.
  }, [map, className, html, anchor, hasPopup, popupMaxWidth]);

  useEffect(() => {
    markerRef.current?.setLngLat([position[1], position[0]]);
  }, [position]);

  return hasPopup && popupOpen ? createPortal(popup, popupHost) : null;
}

/** Popup anclado a un punto del mapa con contenido React. */
export function MapPopup({
  position,
  onClose,
  children,
  maxWidth = '320px',
}: {
  position: [number, number]; // [latitud, longitud]
  onClose?: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const map = useMapInstance();
  const host = useMemo(() => document.createElement('div'), []);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const [lat, lng] = position;

  useEffect(() => {
    const popup = new Popup({ maxWidth, closeButton: true })
      .setLngLat([lng, lat])
      .setDOMContent(host)
      .addTo(map);
    const handleClose = () => closeRef.current?.();
    popup.on('close', handleClose);
    return () => {
      // Al reposicionar no debe avisar "cerrado": solo cuando el usuario lo cierra.
      popup.off('close', handleClose);
      popup.remove();
    };
  }, [map, host, lat, lng, maxWidth]);

  return createPortal(children, host);
}
