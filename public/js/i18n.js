/**
 * Lightweight bilingual layer (français par défaut, English switchable).
 *
 * Usage:
 *   t('feed.live')                       → translate a key
 *   t('toast.connected', { count: 612 }) → interpolate {count}
 *   tn('alerts.notices', n, { n })       → plural form (…one / …other)
 *   applyTranslations(root)              → translate [data-i18n*] markup
 */

const STORAGE_KEY = 'stm-live-radar:lang:v1';
const DEFAULT_LANG = 'fr';
const SUPPORTED = new Set(['fr', 'en']);

const DICTIONARIES = {
  fr: {
    'meta.title': 'STM Live Radar — télémétrie des bus de Montréal',
    'meta.description':
      'STM Live Radar — carte en temps réel et tableau de bord de télémétrie des bus de la Société de transport de Montréal. Propulsé par l’API STM en temps réel de pinkythegawd (MikePinku).',
    noscript: 'STM Live Radar nécessite JavaScript pour afficher la carte en direct.',

    'brand.tagline': 'Télémétrie des bus de Montréal',
    'brand.poweredBy': 'Propulsé par pinkythegawd <em>(MikePinku)</em>',

    'stats.aria': 'Statistiques du réseau en direct',
    'stats.buses': 'Bus actifs',
    'stats.routes': 'Lignes actives',
    'stats.speed': 'Vitesse réseau',

    'alerts.open': 'Ouvrir les avis de service',
    'alerts.openCount': 'Ouvrir les avis de service ({count})',

    'sync.next': 'Prochaine synchronisation GPS',
    'sync.forceNow': 'Forcer la synchro maintenant (F)',
    'sync.force': 'Forcer la synchro',

    'connection.connecting': 'Connexion',
    'connection.initialSource': 'STM GTFS-RT',
    'connection.syncing': 'Synchro',
    'connection.syncingSource': 'Contact avec la STM',
    'connection.connected': 'En direct',
    'connection.connectedSource': 'Flux STM',
    'connection.stale': 'Cache',
    'connection.staleSource': 'Nouvelle tentative',
    'connection.demo': 'Simulation',
    'connection.demoSource': 'Mode hors ligne',
    'connection.offline': 'Hors ligne',
    'connection.offlineSource': 'Aucune donnée',
    'connection.fallbackSimulation': 'Simulation de secours',

    'sidebar.aria': 'Liste des véhicules et filtres',
    'sidebar.collapse': 'Réduire la liste des véhicules',
    'sidebar.expand': 'Agrandir la liste des véhicules',
    'sidebar.collapseTitle': 'Réduire la liste',
    'sidebar.expandTitle': 'Agrandir la liste',
    'sidebar.searchPlaceholder': 'Ligne, destination ou n° de parc…',
    'sidebar.searchAria': 'Rechercher une ligne, une destination ou un numéro de parc',
    'sidebar.clearSearch': 'Effacer la recherche',
    'sidebar.filterAria': 'Filtrer par type de réseau',
    'sidebar.sheet.bus': 'bus',
    'sidebar.sheet.buses': 'bus',
    'sidebar.sheet.route': 'ligne',
    'sidebar.sheet.routes': 'lignes',

    'chips.all': 'Tous les bus',
    'chips.local': 'Local',
    'chips.express': 'Express',
    'chips.night': 'Nuit',
    'chips.pinned': 'Favoris',
    'chips.shuttle': 'Navette',

    'alertsStrip.one': 'avis de service sur le réseau',
    'alertsStrip.other': 'avis de service sur le réseau',
    'alertsStrip.view': 'Voir',

    'nearby.title': '{count} bus à moins de 2 km',
    'nearby.buses': 'bus',
    'nearby.within': 'à moins de 2 km',
    'nearby.hint': 'Mis en évidence sur la carte autour de vous',
    'nearby.clear': 'Effacer la mise en évidence à proximité',
    'nearby.clearShort': 'Effacer',

    'favorites.aria': 'Lignes favorites',
    'favorites.title': 'Lignes favorites',
    'favorites.storage': 'Enregistrées sur cet appareil',

    'feed.live': 'Véhicules en direct',
    'feed.local': 'Réseau local',
    'feed.express': 'Réseau express',
    'feed.night': 'Réseau de nuit',
    'feed.shuttle': 'Réseau navette',
    'feed.favorites': 'Lignes favorites',
    'feed.count': '{shown} sur {total}',
    'feed.more': '{shown} bus sur {total} affichés · affinez avec la recherche',

    'footer.poweredBy':
      'Propulsé par l’API STM en temps réel de <b>pinkythegawd</b> <em>(MikePinku)</em>',
    'footer.data':
      'Données © Société de transport de Montréal · Fond de carte © Esri / OpenStreetMap',
    'footer.hints': '<kbd>/</kbd> recherche <kbd>F</kbd> synchro <kbd>Échap</kbd> fermer',

    'map.aria': 'Carte des bus STM en direct',
    'map.connecting': 'Connexion à la STM…',
    'map.toolsAria': 'Outils de carte',
    'map.nearMe': 'Près de moi',
    'map.nearMeTitle': 'Trouver les bus à moins de 2 km',
    'map.city': 'Ville',
    'map.cityTitle': 'Revenir à Montréal',
    'map.legend': 'Légende',
    'map.legendTitle': 'Afficher ou masquer la légende',
    'map.waiting': 'En attente de la première synchro',
    'map.refresh': 'Actualisation 15 s',
    'map.markerTitle': 'Ligne {route} · parc {fleet}',
    'map.followLabel': 'ligne {route} · parc #{fleet}',
    'map.zoomIn': 'Zoom avant',
    'map.zoomOut': 'Zoom arrière',
    'map.closePopup': 'Fermer la fenêtre',
    'map.tilesAttribution':
      'Tuiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',

    'compass.N': 'N',
    'compass.NE': 'NE',
    'compass.E': 'E',
    'compass.SE': 'SE',
    'compass.S': 'S',
    'compass.SW': 'SO',
    'compass.W': 'O',
    'compass.NW': 'NO',

    'legend.title': 'Légende du réseau',
    'network.local': 'Local',
    'network.night': 'Nuit',
    'network.express': 'Express',
    'network.shuttle': 'Navette / 747',
    'legend.tip':
      'Le chevron indique le cap en direct · cliquez sur un bus pour la télémétrie',

    'follow.following': 'Suivi de',
    'follow.stop': 'Arrêter',

    'loading.title': 'Acquisition du signal GPS STM…',
    'loading.subtitle': 'Connexion au réseau de bus en temps réel',

    'drawer.title': 'Avis de service',
    'drawer.close': 'Fermer les avis de service',
    'drawer.activeOnly': 'Seulement les lignes sur la carte',
    'drawer.source': 'Source : État du service STM',
    'drawer.refresh': 'Avis actualisés toutes les 60 s',

    'lang.switchAria': 'Langue',

    'time.justNow': 'à l’instant',
    'time.secondsAgo': '{s} s',
    'time.minutesAgo': '{m} min',
    'time.minutesSecondsAgo': '{m} min {s} s',
    'time.hoursAgo': '{h} h {m} min',

    'status.IN_TRANSIT_TO': 'En circulation',
    'status.STOPPED_AT': 'À l’arrêt',
    'status.INCOMING_AT': 'Arrivée imminente',
    'status.moving': 'En mouvement',

    'vehicle.destinationUnavailable': 'Destination non disponible',
    'vehicle.route': 'Ligne {route}',
    'vehicle.routeWithName': '{route} · {name}',
    'vehicle.cardAria': 'Ligne {route} vers {headsign}, parc {fleet}',
    'vehicle.pin': 'Épingler',
    'vehicle.unpin': 'Désépingler',
    'vehicle.pinAria': 'Épingler la ligne {route}',
    'vehicle.unpinAria': 'Désépingler la ligne {route}',

    'popup.fleet': 'PARC',
    'popup.speed': 'Vitesse',
    'popup.heading': 'Cap',
    'popup.lastPing': 'Dernier signal GPS',
    'popup.occupancy': 'Occupation',
    'popup.load': 'Charge passagers',
    'popup.stopFollow': '◉ Arrêter le suivi',
    'popup.follow': '◎ Suivre ce bus',
    'popup.direction': 'direction {direction}',

    'occupancy.short.EMPTY': 'Vide',
    'occupancy.short.MANY_SEATS_AVAILABLE': 'Plusieurs sièges',
    'occupancy.short.FEW_SEATS_AVAILABLE': 'Peu de sièges',
    'occupancy.short.STANDING_ROOM_ONLY': 'Debout seulement',
    'occupancy.short.CRUSHED_STANDING_ROOM_ONLY': 'Très achalandé',
    'occupancy.short.FULL': 'Complet',
    'occupancy.short.NOT_ACCEPTING_PASSENGERS': 'Sans embarquement',
    'occupancy.short.NOT_BOARDABLE': 'Non embarquable',
    'occupancy.short.NO_DATA_AVAILABLE': 'Aucune donnée',
    'occupancy.long.EMPTY': 'Vide',
    'occupancy.long.MANY_SEATS_AVAILABLE': 'Plusieurs sièges libres',
    'occupancy.long.FEW_SEATS_AVAILABLE': 'Peu de sièges libres',
    'occupancy.long.STANDING_ROOM_ONLY': 'Place debout seulement',
    'occupancy.long.CRUSHED_STANDING_ROOM_ONLY': 'Très achalandé',
    'occupancy.long.FULL': 'Complet',
    'occupancy.long.NOT_ACCEPTING_PASSENGERS': 'Ne prend pas de passagers',
    'occupancy.long.NOT_BOARDABLE': 'Embarquement impossible',
    'occupancy.long.NO_DATA_AVAILABLE': 'Données d’occupation indisponibles',

    'empty.noBusesTitle': 'Aucun bus sur la carte pour le moment',
    'empty.noBusesBody':
      'Le flux est en cours de connexion. Patientez quelques secondes ou forcez une synchro GPS.',
    'empty.forceSync': 'Forcer la synchro',
    'empty.noMatchTitle': 'Aucun bus correspondant',
    'empty.pinHint': 'Épinglez une ligne avec le bouton ★ pour la garder ici.',
    'empty.queryHint':
      'Aucun résultat pour « {query} ». Essayez un numéro de ligne, une destination ou un numéro de parc.',
    'empty.filterHint': 'Aucun bus ne correspond à ce filtre pour le moment.',
    'empty.clearFilters': 'Réinitialiser les filtres',

    'alert.serviceNotice': 'Avis de service',
    'alert.active': 'En cours',
    'alert.stops': 'Arrêts :',
    'alert.showMore': 'Afficher plus',
    'alert.showLess': 'Afficher moins',

    'alerts.notices.one': '{n} avis',
    'alerts.notices.other': '{n} avis',
    'alerts.routes.one': '{n} ligne',
    'alerts.routes.other': '{n} lignes',
    'alerts.emptyActive':
      'Aucun avis de service pour les lignes actuellement sur la carte. Décochez le filtre pour voir tout le réseau.',
    'alerts.empty': 'Aucun avis de service actif pour le moment.',
    'alerts.sourceOfficial': 'État du service STM',
    'alerts.sourceSimulation': 'simulation',

    'command.liveApi': 'API en direct · {source}',
    'command.cached': 'Flux en cache · nouvelle tentative',
    'command.simulation': 'Simulation de secours · aucun flux en direct',
    'command.connecting': 'Connexion à la STM…',
    'command.updated': 'Mis à jour à {clock} · {source}',
    'command.sourceStm': 'STM',
    'command.stmRealtime': 'STM GTFS-Realtime',
    'command.pinkyApi': 'pinkythegawd API',

    'title.live': '{count} bus en direct · STM Live Radar',
    'title.default': 'STM Live Radar — télémétrie des bus de Montréal',

    'toast.mapFailed': 'Le moteur de carte n’a pas pu se charger.',
    'toast.leaflet':
      'Leaflet n’a pas pu se charger. Vérifiez /vendor/leaflet/leaflet.js.',
    'toast.tileError':
      'Les tuiles du fond de carte sont indisponibles — les données en direct continuent de se mettre à jour.',
    'toast.connected': 'Connecté · {count} bus sur {source}',
    'toast.simulation':
      'Flux STM indisponible — passage à la simulation intégrée de Montréal. Nouvelle tentative toutes les 15 s.',
    'toast.liveRestored': 'Flux STM rétabli — les bus en temps réel sont de retour.',
    'toast.delayed':
      'Flux STM retardé — positions en cache affichées pendant la nouvelle tentative.',
    'toast.liveConnected': 'Flux en direct connecté · {source}',
    'toast.routePinned': 'Ligne {route} épinglée en haut.',
    'toast.routeUnpinned': 'Ligne {route} désépinglée.',
    'toast.followStopped': 'Suivi caméra arrêté.',
    'toast.busLeft': 'Ce bus a quitté le réseau — le suivi caméra est arrêté.',
    'toast.locked': 'Caméra verrouillée sur la ligne {route} · parc #{fleet}.',
    'toast.pinFirst': 'Épinglez d’abord une ligne avec le bouton ★.',
    'toast.geoUnsupported':
      'La géolocalisation n’est pas prise en charge par ce navigateur.',
    'toast.nearby.one': '{n} bus STM à moins de 2 km de vous.',
    'toast.nearby.other': '{n} bus STM à moins de 2 km de vous.',
    'toast.geoDenied':
      'Autorisation de localisation refusée. Activez-la dans votre navigateur pour utiliser « Près de moi ».',
    'toast.geoUnavailable': 'Votre position est indisponible pour le moment.',
    'toast.geoTimeout': 'La localisation a expiré. Réessayez dans un instant.',
    'toast.geoUnknown': 'Impossible d’obtenir votre position.',
    'toast.forceSyncing': 'Synchronisation forcée des positions GPS STM…',
    'toast.syncBusy': 'Une synchronisation est déjà en cours.',

    'sim.titleLine': 'Votre ligne',
    'sim.titleStop': 'Votre arrêt',
    'sim.body1':
      'SIMULATION — Certains arrêts sont annulés ou déplacés sur la ligne 139 (Pie-IX) en raison de travaux entre Notre-Dame et Sherbrooke. Prévoyez quelques minutes de plus.',
    'sim.body2':
      'SIMULATION — La ligne 747 offre un service supplémentaire entre le centre-ville et l’aéroport YUL. Prévoyez un bus toutes les 8 à 12 minutes.',
    'sim.body3':
      'SIMULATION — L’arrêt 51860 (De Lorimier / Rosemont) n’est pas desservi. Utilisez l’arrêt temporaire à 120 m à l’est sur Rosemont.',
    'sim.body4':
      'SIMULATION — Les lignes de nuit 356, 361 et 376 circulent normalement. Dernière mise à jour à l’instant.',
  },

  en: {
    'meta.title': 'STM Live Radar — Montréal bus telemetry',
    'meta.description':
      'STM Live Radar — real-time map and telemetry dashboard for Société de transport de Montréal buses. Powered by the STM Real-Time API by pinkythegawd (MikePinku).',
    noscript: 'STM Live Radar needs JavaScript to draw the live map.',

    'brand.tagline': 'Montréal bus telemetry',
    'brand.poweredBy': 'Powered by pinkythegawd <em>(MikePinku)</em>',

    'stats.aria': 'Live network statistics',
    'stats.buses': 'Active buses',
    'stats.routes': 'Routes live',
    'stats.speed': 'Network speed',

    'alerts.open': 'Open service alerts',
    'alerts.openCount': 'Open service alerts ({count})',

    'sync.next': 'Next GPS synchronisation',
    'sync.forceNow': 'Force sync now (F)',
    'sync.force': 'Force sync',

    'connection.connecting': 'Connecting',
    'connection.initialSource': 'STM GTFS-RT',
    'connection.syncing': 'Syncing',
    'connection.syncingSource': 'Contacting STM',
    'connection.connected': 'Live',
    'connection.connectedSource': 'STM feed',
    'connection.stale': 'Cached',
    'connection.staleSource': 'Upstream retry',
    'connection.demo': 'Simulation',
    'connection.demoSource': 'Offline fallback',
    'connection.offline': 'Offline',
    'connection.offlineSource': 'No data',
    'connection.fallbackSimulation': 'Fallback simulation',

    'sidebar.aria': 'Vehicle list and filters',
    'sidebar.collapse': 'Collapse vehicle list',
    'sidebar.expand': 'Expand vehicle list',
    'sidebar.collapseTitle': 'Collapse list',
    'sidebar.expandTitle': 'Expand list',
    'sidebar.searchPlaceholder': 'Route, destination or fleet #…',
    'sidebar.searchAria': 'Search route, destination or fleet number',
    'sidebar.clearSearch': 'Clear search',
    'sidebar.filterAria': 'Filter by network type',
    'sidebar.sheet.bus': 'bus',
    'sidebar.sheet.buses': 'buses',
    'sidebar.sheet.route': 'route',
    'sidebar.sheet.routes': 'routes',

    'chips.all': 'All buses',
    'chips.local': 'Local',
    'chips.express': 'Express',
    'chips.night': 'Night',
    'chips.pinned': 'Pinned',
    'chips.shuttle': 'Shuttle',

    'alertsStrip.one': 'service notice on the network',
    'alertsStrip.other': 'service notices on the network',
    'alertsStrip.view': 'View',

    'nearby.title': '{count} buses within 2 km',
    'nearby.buses': 'buses',
    'nearby.within': 'within 2 km',
    'nearby.hint': 'Highlighted on the map around your location',
    'nearby.clear': 'Clear nearby highlight',
    'nearby.clearShort': 'Clear',

    'favorites.aria': 'Pinned routes',
    'favorites.title': 'Pinned routes',
    'favorites.storage': 'Saved on this device',

    'feed.live': 'Live vehicles',
    'feed.local': 'Local network',
    'feed.express': 'Express network',
    'feed.night': 'Night network',
    'feed.shuttle': 'Shuttle network',
    'feed.favorites': 'Pinned routes',
    'feed.count': '{shown} of {total}',
    'feed.more': 'Showing {shown} of {total} buses · search to narrow the list',

    'footer.poweredBy':
      'Powered by the STM Real-Time API by <b>pinkythegawd</b> <em>(MikePinku)</em>',
    'footer.data':
      'Data © Société de transport de Montréal · Basemap © Esri / OpenStreetMap',
    'footer.hints': '<kbd>/</kbd> search <kbd>F</kbd> force sync <kbd>Esc</kbd> close',

    'map.aria': 'Live STM bus map',
    'map.connecting': 'Connecting to STM…',
    'map.toolsAria': 'Map tools',
    'map.nearMe': 'Near me',
    'map.nearMeTitle': 'Find buses within 2 km',
    'map.city': 'City',
    'map.cityTitle': 'Reset to Montréal',
    'map.legend': 'Legend',
    'map.legendTitle': 'Toggle map legend',
    'map.waiting': 'Waiting for first sync',
    'map.refresh': '15 s refresh',
    'map.markerTitle': 'Route {route} · fleet {fleet}',
    'map.followLabel': 'route {route} · #{fleet}',
    'map.zoomIn': 'Zoom in',
    'map.zoomOut': 'Zoom out',
    'map.closePopup': 'Close popup',
    'map.tilesAttribution':
      'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',

    'compass.N': 'N',
    'compass.NE': 'NE',
    'compass.E': 'E',
    'compass.SE': 'SE',
    'compass.S': 'S',
    'compass.SW': 'SW',
    'compass.W': 'W',
    'compass.NW': 'NW',

    'legend.title': 'Network legend',
    'network.local': 'Local',
    'network.night': 'Night',
    'network.express': 'Express',
    'network.shuttle': 'Shuttle / 747',
    'legend.tip':
      'Chevron shows live heading · click a bus for telemetry',

    'follow.following': 'Following',
    'follow.stop': 'Stop',

    'loading.title': 'Acquiring STM GPS signal…',
    'loading.subtitle': 'Connecting to the real-time bus network',

    'drawer.title': 'Service alerts',
    'drawer.close': 'Close service alerts',
    'drawer.activeOnly': 'Only routes currently on the map',
    'drawer.source': 'Source: STM État du service',
    'drawer.refresh': 'Alerts refresh every 60 s',

    'lang.switchAria': 'Language',

    'time.justNow': 'just now',
    'time.secondsAgo': '{s}s ago',
    'time.minutesAgo': '{m}m ago',
    'time.minutesSecondsAgo': '{m}m {s}s ago',
    'time.hoursAgo': '{h}h {m}m ago',

    'status.IN_TRANSIT_TO': 'In transit',
    'status.STOPPED_AT': 'At stop',
    'status.INCOMING_AT': 'Arriving',
    'status.moving': 'Moving',

    'vehicle.destinationUnavailable': 'Destination unavailable',
    'vehicle.route': 'Route {route}',
    'vehicle.routeWithName': '{route} · {name}',
    'vehicle.cardAria': 'Route {route} to {headsign}, fleet {fleet}',
    'vehicle.pin': 'Pin',
    'vehicle.unpin': 'Unpin',
    'vehicle.pinAria': 'Pin route {route}',
    'vehicle.unpinAria': 'Unpin route {route}',

    'popup.fleet': 'FLEET',
    'popup.speed': 'Speed',
    'popup.heading': 'Heading',
    'popup.lastPing': 'Last GPS ping',
    'popup.occupancy': 'Occupancy',
    'popup.load': 'Passenger load',
    'popup.stopFollow': '◉ Stop following',
    'popup.follow': '◎ Lock camera / follow',
    'popup.direction': 'direction {direction}',

    'occupancy.short.EMPTY': 'Empty',
    'occupancy.short.MANY_SEATS_AVAILABLE': 'Many seats',
    'occupancy.short.FEW_SEATS_AVAILABLE': 'Few seats',
    'occupancy.short.STANDING_ROOM_ONLY': 'Standing only',
    'occupancy.short.CRUSHED_STANDING_ROOM_ONLY': 'Crushed',
    'occupancy.short.FULL': 'Full',
    'occupancy.short.NOT_ACCEPTING_PASSENGERS': 'Not boarding',
    'occupancy.short.NOT_BOARDABLE': 'Not boardable',
    'occupancy.short.NO_DATA_AVAILABLE': 'No data',
    'occupancy.long.EMPTY': 'Empty',
    'occupancy.long.MANY_SEATS_AVAILABLE': 'Many seats available',
    'occupancy.long.FEW_SEATS_AVAILABLE': 'Few seats available',
    'occupancy.long.STANDING_ROOM_ONLY': 'Standing room only',
    'occupancy.long.CRUSHED_STANDING_ROOM_ONLY': 'Crushed standing room',
    'occupancy.long.FULL': 'Full',
    'occupancy.long.NOT_ACCEPTING_PASSENGERS': 'Not accepting passengers',
    'occupancy.long.NOT_BOARDABLE': 'Not boardable',
    'occupancy.long.NO_DATA_AVAILABLE': 'No occupancy data',

    'empty.noBusesTitle': 'No buses on the map yet',
    'empty.noBusesBody':
      'The feed is still connecting. Give it a few seconds or force a GPS sync.',
    'empty.forceSync': 'Force sync now',
    'empty.noMatchTitle': 'No matching buses',
    'empty.pinHint': 'Pin a route with the ★ button to keep it here.',
    'empty.queryHint':
      'Nothing matches “{query}”. Try a route number, destination or fleet ID.',
    'empty.filterHint': 'No buses match this filter right now.',
    'empty.clearFilters': 'Clear filters',

    'alert.serviceNotice': 'Service notice',
    'alert.active': 'Active',
    'alert.stops': 'Stops:',
    'alert.showMore': 'Show more',
    'alert.showLess': 'Show less',

    'alerts.notices.one': '{n} notice',
    'alerts.notices.other': '{n} notices',
    'alerts.routes.one': '{n} route',
    'alerts.routes.other': '{n} routes',
    'alerts.emptyActive':
      'No service notices for routes currently on the map. Uncheck the filter to see the whole network.',
    'alerts.empty': 'No active service notices right now.',
    'alerts.sourceOfficial': 'STM état du service',
    'alerts.sourceSimulation': 'simulation',

    'command.liveApi': 'Live API · {source}',
    'command.cached': 'Cached feed · retrying upstream',
    'command.simulation': 'Fallback simulation · no live feed',
    'command.connecting': 'Connecting to STM…',
    'command.updated': 'Updated {clock} · {source}',
    'command.sourceStm': 'STM',
    'command.stmRealtime': 'STM GTFS-Realtime',
    'command.pinkyApi': 'pinkythegawd API',

    'title.live': '{count} buses live · STM Live Radar',
    'title.default': 'STM Live Radar — Montréal bus telemetry',

    'toast.mapFailed': 'Map engine failed to load.',
    'toast.leaflet': 'Leaflet could not be loaded. Check /vendor/leaflet/leaflet.js.',
    'toast.tileError':
      'Basemap tiles are unavailable — the live data is still updating.',
    'toast.connected': 'Connected · {count} buses on {source}',
    'toast.simulation':
      'Live STM feed unavailable — switched to the built-in Montreal simulation. Retrying every 15 s.',
    'toast.liveRestored': 'Live STM feed restored — real-time buses are back.',
    'toast.delayed':
      'STM feed delayed — showing cached positions while retrying.',
    'toast.liveConnected': 'Live feed connected · {source}',
    'toast.routePinned': 'Route {route} pinned to the top.',
    'toast.routeUnpinned': 'Route {route} unpinned.',
    'toast.followStopped': 'Camera follow stopped.',
    'toast.busLeft': 'That bus left the network — camera follow stopped.',
    'toast.locked': 'Locked on route {route} · fleet #{fleet}.',
    'toast.pinFirst': 'Pin a route with the ★ button first.',
    'toast.geoUnsupported': 'Geolocation is not supported by this browser.',
    'toast.nearby.one': '{n} STM bus within 2 km of you.',
    'toast.nearby.other': '{n} STM buses within 2 km of you.',
    'toast.geoDenied':
      'Location permission denied. Enable it in your browser to use Near me.',
    'toast.geoUnavailable': 'Your location is unavailable right now.',
    'toast.geoTimeout': 'Locating timed out. Try again in a moment.',
    'toast.geoUnknown': 'Unable to get your location.',
    'toast.forceSyncing': 'Force-syncing STM GPS positions…',
    'toast.syncBusy': 'A sync is already in progress.',

    'sim.titleLine': 'Your line',
    'sim.titleStop': 'Your stop',
    'sim.body1':
      'SIMULATION — Some stops are cancelled or relocated on route 139 (Pie-IX) due to roadwork between Notre-Dame and Sherbrooke. Allow a few extra minutes.',
    'sim.body2':
      'SIMULATION — Route 747 is running with extra service between downtown and YUL airport. Expect a bus every 8–12 minutes.',
    'sim.body3':
      'SIMULATION — Stop 51860 (De Lorimier / Rosemont) is not served. Use the temporary stop 120 m east on Rosemont.',
    'sim.body4':
      'SIMULATION — Night network routes 356, 361 and 376 are operating normally. Last updated just now.',
  },
};

let currentLanguage = readLanguage();
const listeners = new Set();

function readLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.has(stored)) return stored;
  } catch {
    // Storage can be unavailable in private modes; fall back to French.
  }
  return DEFAULT_LANG;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  ));
}

export function getLang() {
  return currentLanguage;
}

export function getLocale() {
  return currentLanguage === 'fr' ? 'fr-CA' : 'en-CA';
}

export function t(key, vars) {
  const dictionary = DICTIONARIES[currentLanguage] || DICTIONARIES[DEFAULT_LANG];
  const value = dictionary[key] ?? DICTIONARIES[DEFAULT_LANG][key] ?? key;
  return interpolate(value, vars);
}

/** Plural helper: expects `<key>.one` and `<key>.other` entries. */
export function tn(key, count, vars = {}) {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { n: count, ...vars });
}

export function onLangChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTranslations(root = document) {
  if (!root || !root.querySelectorAll) return;

  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }

  for (const button of root.querySelectorAll('[data-lang]')) {
    const active = button.dataset.lang === currentLanguage;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('meta.description'));

  document.documentElement.lang = getLocale();
}

export function setLang(language) {
  const next = SUPPORTED.has(String(language).toLowerCase())
    ? String(language).toLowerCase()
    : DEFAULT_LANG;

  if (next !== currentLanguage) {
    currentLanguage = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persisting the choice is best-effort.
    }
  }

  applyTranslations();
  for (const listener of listeners) {
    try {
      listener(currentLanguage);
    } catch (err) {
      console.error('[i18n] listener failed', err);
    }
  }
}

/** Call once after the DOM is parsed and before the UI renders. */
export function initI18n() {
  applyTranslations();
  return currentLanguage;
}
