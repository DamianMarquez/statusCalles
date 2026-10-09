import { useEffect, useMemo, useState } from 'react';
import {
  confirmSegmentRoadInformation,
  getSegmentRoadInformation,
  proposeSegmentRoadInformation,
} from '../../api/roadInformationApi.js';
import type {
  RoadInformationPatch,
  SegmentRoadInformation,
  SpecialTreatment,
} from '../../api/roadInformationTypes.js';
import {
  ROAD_TYPE_OPTIONS,
  SPECIAL_TREATMENT_OPTIONS,
  SURFACE_CONDITION_OPTIONS,
  SURFACE_TYPE_OPTIONS,
} from '../../api/roadInformationTypes.js';

const roadTypeLabels = Object.fromEntries(
  ROAD_TYPE_OPTIONS.map((item) => [item.value, item.label]),
);
const surfaceTypeLabels = Object.fromEntries(
  SURFACE_TYPE_OPTIONS.map((item) => [item.value, item.label]),
);
const surfaceConditionLabels = Object.fromEntries(
  SURFACE_CONDITION_OPTIONS.map((item) => [item.value, item.label]),
);
const treatmentLabels = Object.fromEntries(
  SPECIAL_TREATMENT_OPTIONS.map((item) => [item.value, item.label]),
);

function describePatch(patch: RoadInformationPatch) {
  return [
    patch.roadType ? `Tipo de vía: ${roadTypeLabels[patch.roadType]}` : null,
    patch.surfaceType ? `Pavimento: ${surfaceTypeLabels[patch.surfaceType]}` : null,
    patch.surfaceCondition ? `Estado: ${surfaceConditionLabels[patch.surfaceCondition]}` : null,
    patch.specialTreatments
      ? `Tratamientos: ${patch.specialTreatments.map((item) => treatmentLabels[item]).join(', ')}`
      : null,
  ].filter(Boolean);
}

export function RoadInformationPanel({
  segmentId,
  authenticated,
  onRequestLogin,
  onChanged,
  initialFormOpen = false,
}: {
  segmentId: string;
  authenticated: boolean;
  onRequestLogin: () => void;
  onChanged: () => void;
  initialFormOpen?: boolean;
}) {
  const [information, setInformation] = useState<SegmentRoadInformation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(initialFormOpen);
  const [success, setSuccess] = useState(false);
  const [roadType, setRoadType] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [surfaceCondition, setSurfaceCondition] = useState('');
  const [treatments, setTreatments] = useState<SpecialTreatment[]>([]);

  const refresh = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setInformation(await getSegmentRoadInformation(segmentId, signal));
      setError(null);
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === 'AbortError'))
        setError(
          loadError instanceof Error ? loadError.message : 'No pudimos cargar la información.',
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [segmentId]);

  const profileRows = useMemo(() => {
    if (!information) return [];
    const profile = information.profile;
    return [
      ['Tipo de vía', profile.roadType ? roadTypeLabels[profile.roadType] : 'Sin información'],
      [
        'Pavimento',
        profile.surfaceType ? surfaceTypeLabels[profile.surfaceType] : 'Sin información',
      ],
      [
        'Estado de calzada',
        profile.surfaceCondition
          ? surfaceConditionLabels[profile.surfaceCondition]
          : 'Sin información',
      ],
      [
        'Tratamientos',
        profile.specialTreatments
          ? profile.specialTreatments.map((item) => treatmentLabels[item]).join(', ')
          : 'Sin información',
      ],
    ];
  }, [information]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authenticated) {
      onRequestLogin();
      return;
    }
    const patch: RoadInformationPatch = {};
    if (roadType) patch.roadType = roadType as RoadInformationPatch['roadType'];
    if (surfaceType) patch.surfaceType = surfaceType as RoadInformationPatch['surfaceType'];
    if (surfaceCondition)
      patch.surfaceCondition = surfaceCondition as RoadInformationPatch['surfaceCondition'];
    if (treatments.length) patch.specialTreatments = treatments;
    if (Object.keys(patch).length === 0) {
      setError('Completá al menos un dato para enviar la propuesta.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setInformation(await proposeSegmentRoadInformation(segmentId, patch));
      setFormOpen(false);
      setSuccess(true);
      setRoadType('');
      setSurfaceType('');
      setSurfaceCondition('');
      setTreatments([]);
      onChanged();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'No pudimos enviar la propuesta.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(proposalId: string) {
    if (!authenticated) {
      onRequestLogin();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setInformation(await confirmSegmentRoadInformation(proposalId));
      onChanged();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error ? confirmError.message : 'No pudimos confirmar el dato.',
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleTreatment(value: SpecialTreatment) {
    setTreatments((current) => {
      if (value === 'NONE') return current.includes('NONE') ? [] : ['NONE'];
      return current.includes(value)
        ? current.filter((item) => item !== value && item !== 'NONE')
        : [...current.filter((item) => item !== 'NONE'), value];
    });
  }

  return (
    <section className="road-information-panel" aria-label="Información del segmento vial">
      <h3>Datos del tramo</h3>
      <p className="road-information-help">
        La información vigente y las propuestas de la comunidad aparecen por separado. Completá solo
        los datos que conocés.
      </p>
      {loading ? (
        <p role="status">Cargando información…</p>
      ) : information ? (
        <>
          <dl>
            {profileRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {information.profile.updatedAt && (
            <small>
              Actualizado: {new Date(information.profile.updatedAt).toLocaleDateString('es-AR')}
            </small>
          )}
          {information.proposals.length > 0 && (
            <div className="road-information-proposals">
              <h4>Propuestas pendientes</h4>
              <p>Una propuesta se confirma con tres usuarios distintos de quien la creó.</p>
              {information.proposals.map((proposal) => (
                <article key={proposal.id}>
                  <ul>
                    {describePatch(proposal.attributes).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <span>
                    {proposal.confirmations}/{proposal.requiredConfirmations} confirmaciones
                    {` · faltan ${Math.max(0, proposal.requiredConfirmations - proposal.confirmations)}`}
                  </span>
                  {!proposal.isAuthor && !proposal.userHasConfirmed && (
                    <button type="button" disabled={busy} onClick={() => void confirm(proposal.id)}>
                      Confirmar información
                    </button>
                  )}
                  {proposal.userHasConfirmed && <small>Ya confirmaste esta propuesta.</small>}
                  {proposal.isAuthor && <small>Tu propuesta espera confirmaciones.</small>}
                </article>
              ))}
            </div>
          )}
          {information.history.length > 0 && (
            <details>
              <summary>Historial de actualizaciones confirmadas</summary>
              <ul>
                {information.history.map((entry) => (
                  <li key={entry.id}>
                    {new Date(entry.appliedAt).toLocaleDateString('es-AR')} ·{' '}
                    {describePatch(entry).join(' · ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : null}
      {error && (
        <p className="road-information-error" role="alert">
          {error}
        </p>
      )}
      {error && !information && (
        <button type="button" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Cargando…' : 'Reintentar carga'}
        </button>
      )}
      {success && (
        <p className="road-information-success" role="status">
          Propuesta enviada. Quedará vigente cuando reúna las confirmaciones necesarias.
        </p>
      )}
      {!authenticated && (
        <p className="road-information-help">Iniciá sesión para proponer o confirmar datos.</p>
      )}
      {!formOpen ? (
        <button
          type="button"
          onClick={() => (authenticated ? setFormOpen(true) : onRequestLogin())}
        >
          Informar un dato
        </button>
      ) : (
        <form className="road-information-form" onSubmit={(event) => void submit(event)}>
          <strong>Nueva propuesta</strong>
          <small>Dejá en “Sin cambio” los atributos que no quieras informar.</small>
          <label>
            Tipo de vía
            <select
              autoFocus={initialFormOpen}
              value={roadType}
              onChange={(event) => setRoadType(event.target.value)}
            >
              <option value="">Sin cambio</option>
              {ROAD_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de pavimento
            <select value={surfaceType} onChange={(event) => setSurfaceType(event.target.value)}>
              <option value="">Sin cambio</option>
              {SURFACE_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado de calzada
            <select
              value={surfaceCondition}
              onChange={(event) => setSurfaceCondition(event.target.value)}
            >
              <option value="">Sin cambio</option>
              {SURFACE_CONDITION_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Tratamientos especiales</legend>
            {SPECIAL_TREATMENT_OPTIONS.map((item) => (
              <label key={item.value}>
                <input
                  type="checkbox"
                  checked={treatments.includes(item.value)}
                  onChange={() => toggleTreatment(item.value)}
                />{' '}
                {item.label}
              </label>
            ))}
          </fieldset>
          <div>
            <button type="button" disabled={busy} onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar propuesta'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
