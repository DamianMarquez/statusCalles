import { useState, type FormEvent } from 'react';
import type {
  CreateReportInput,
  ReportDto,
  ReportSeverity,
  ReportType,
} from '../../api/reportTypes.js';
import type { UserLocation } from './types.js';

const reportTypes: { value: ReportType; label: string }[] = [
  { value: 'POTHOLE', label: 'Bache' },
  { value: 'FLOOD', label: 'Inundación' },
  { value: 'ROAD_DAMAGE', label: 'Pavimento deteriorado' },
  { value: 'ROAD_BLOCKED', label: 'Calle bloqueada' },
  { value: 'ROAD_WORK', label: 'Obra' },
  { value: 'TRAFFIC_LIGHT', label: 'Semáforo roto' },
  { value: 'OTHER', label: 'Otro' },
];

const severities: { value: ReportSeverity; label: string }[] = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'CRITICAL', label: 'Crítica' },
];

interface ReportFormProps {
  location: UserLocation;
  currentLocation: UserLocation | null;
  onUseCurrentLocation: () => void;
  onCancel: () => void;
  onSubmit: (input: CreateReportInput) => Promise<ReportDto>;
}

export function ReportForm({
  location,
  currentLocation,
  onUseCurrentLocation,
  onCancel,
  onSubmit,
}: ReportFormProps) {
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type || !severity) return;

    setIsSubmitting(true);
    setError(null);
    const trimmedDescription = description.trim();
    const input: CreateReportInput = {
      type: type as ReportType,
      severity: severity as ReportSeverity,
      latitude: location.latitude,
      longitude: location.longitude,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    };

    try {
      await onSubmit(input);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No pudimos enviar el reporte. Intentá de nuevo.',
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="report-form-backdrop">
      <section
        className="report-form-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-form-title"
      >
        <div className="report-form-panel__heading">
          <div>
            <span className="report-form-panel__eyebrow">NUEVO REPORTE</span>
            <h2 id="report-form-title">¿Qué problema encontraste?</h2>
          </div>
          <button
            className="report-form-panel__close"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Cerrar formulario"
          >
            ×
          </button>
        </div>

        <form className="report-form" onSubmit={handleSubmit}>
          <label>
            Tipo de problema
            <select value={type} onChange={(event) => setType(event.target.value)} required>
              <option value="" disabled>
                Elegí una opción
              </option>
              {reportTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Severidad
            <select value={severity} onChange={(event) => setSeverity(event.target.value)} required>
              <option value="" disabled>
                Elegí una opción
              </option>
              {severities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Descripción <span className="report-form__optional">(opcional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Agregá un detalle que ayude a otras personas"
            />
            <span className="report-form__counter">{description.length}/500</span>
          </label>

          <div className="report-form__location">
            <div>
              <span className="report-form__location-label">Ubicación seleccionada</span>
              <strong>
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </strong>
            </div>
            {currentLocation && (
              <button type="button" onClick={onUseCurrentLocation}>
                Usar mi ubicación
              </button>
            )}
          </div>

          {error && (
            <p className="report-form__error" role="alert">
              {error}
            </p>
          )}

          <div className="report-form__actions">
            <button
              className="report-form__cancel"
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button className="report-form__submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando…' : 'Enviar reporte'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
