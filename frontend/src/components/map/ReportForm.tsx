import { useState, type FormEvent } from 'react';
import type {
  CreateReportInput,
  ReportDto,
  ReportSeverity,
  ReportType,
} from '../../api/reportTypes.js';
import { REPORT_SEVERITY_OPTIONS, REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';
import type { UserLocation } from './types.js';
import { AddressSearchInput } from './AddressSearchInput.js';
import type { AddressSearchResult } from '../../api/addressesApi.js';

interface ReportFormProps {
  location: UserLocation;
  currentLocation: UserLocation | null;
  onUseCurrentLocation: () => void;
  onSelectAddress: (address: AddressSearchResult) => void;
  onCancel: () => void;
  onSubmit: (input: CreateReportInput, allowSimilar?: boolean) => Promise<ReportDto>;
}

export function ReportForm({
  location,
  currentLocation,
  onUseCurrentLocation,
  onSelectAddress,
  onCancel,
  onSubmit,
}: ReportFormProps) {
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similarFound, setSimilarFound] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<AddressSearchResult | null>(null);

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
      await onSubmit(input, similarFound);
    } catch (submitError) {
      if (
        submitError instanceof Error &&
        'code' in submitError &&
        submitError.code === 'SIMILAR_REPORT_EXISTS'
      ) {
        setSimilarFound(true);
        setError(
          'Ya existe un reporte similar cerca de esta ubicación. Revisalo en el mapa antes de continuar.',
        );
      } else
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
              {REPORT_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {type === 'ROAD_ELEVATION' && (
            <p className="report-form__hint">
              Indicá una deformación anómala de la calzada. No incluyas lomos de burro ni badenes
              intencionales.
            </p>
          )}

          <label>
            Severidad
            <select value={severity} onChange={(event) => setSeverity(event.target.value)} required>
              <option value="" disabled>
                Elegí una opción
              </option>
              {REPORT_SEVERITY_OPTIONS.map((item) => (
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
                {selectedAddress?.displayName ??
                  `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}
              </strong>
            </div>
            {currentLocation && (
              <button type="button" onClick={onUseCurrentLocation}>
                Usar mi ubicación
              </button>
            )}
          </div>

          <AddressSearchInput
            label="Buscar dirección para ubicar el reporte"
            value={selectedAddress}
            onSelect={(address) => {
              setSelectedAddress(address);
              onSelectAddress(address);
            }}
            onClear={() => setSelectedAddress(null)}
          />

          {error && (
            <p className="report-form__error" role="alert">
              {error}
            </p>
          )}

          {similarFound && (
            <button
              className="report-form__submit"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                const form = document.querySelector<HTMLFormElement>('.report-form');
                form?.requestSubmit();
              }}
            >
              Continuar y crear igualmente
            </button>
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
