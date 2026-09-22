<?php
/**
 * Studio Varaždin — Nikola Vudrag Questions API
 * Real-time collaborative questions backend with atomic file locking
 * Compatible with cPanel / AlmaLinux / Apache / PHP 7.4+
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = dirname(__DIR__) . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}
$dataFile = $dataDir . '/questions.json';

// Helper for cleaning text safely
function cleanInputText($str, $maxLen = 5000) {
    if (!is_string($str)) return '';
    // Strip null bytes
    $clean = str_replace(chr(0), '', $str);
    $clean = trim($clean);
    if (function_exists('mb_substr')) {
        return mb_substr($clean, 0, $maxLen, 'UTF-8');
    }
    return substr($clean, 0, $maxLen);
}

// Fallback seed structure if file doesn't exist
function getSeedData() {
    return [
        'version' => 1,
        'lastModified' => time(),
        'sections' => [
            [
                'id' => 'sec-teologija',
                'title' => '01. TEOLOGIJA, SJEMENIŠTE I POJAM BOGA',
                'navTitle' => '01. Teologija & Bog',
                'questions' => [
                    [
                        'id' => 'q1',
                        'num' => '01',
                        'text' => 'Bio si u sjemeništu na Kaptolu jer te teologija zanimala kao znanost i sustav mišljenja. Što te u crkvenom sustavu razočaralo da si ga napustio, a što si iz teologije ponio sa sobom u kiparstvo?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q2',
                        'num' => '02',
                        'text' => 'U teologiji Bog stvara svijet *ex nihilo* (iz ničega), a kipar se bori sa sirovom tvari. Je li tvoj rad u radioni pokušaj duhovnog stvaranja ili čisti materijalni inat?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q3',
                        'num' => '03',
                        'text' => 'Zašto se u umjetnosti danas ljudi srame govoriti o vjeri, duhovnosti i svetom — je li moderna umjetnost izgubila vezu s metafizikom?',
                        'updatedAt' => time()
                    ]
                ]
            ],
            [
                'id' => 'sec-nietzsche',
                'title' => '02. NIETZSCHE, VOLJA I PREVLADAVANJE SAMOGA SEBE',
                'navTitle' => '02. Nietzsche & Volja',
                'questions' => [
                    [
                        'id' => 'q4',
                        'num' => '04',
                        'text' => 'Znamo da u svojoj privatnoj kolekciji čuvaš skulpturu *„Friedrich Nietzsche s rogovima”* koju ne želiš prodati. Zašto baš Nietzsche i zašto rogovi?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q5',
                        'num' => '05',
                        'text' => 'Nietzsche piše o tome da čovjek mora proći kroz vlastiti pakao i patnju da bi stvorio nešto veliko. Koliko je tvoja osobna kriza — onaj period kad si u jednom danu ostao bez posla, stana i veze — bila gorivo za ovo što danas radiš?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q6',
                        'num' => '06',
                        'text' => 'Danas se često čuje da je kultura postala prenježna i površna. Što tebi znači Nietzscheov pojam *volje za moć* kad stojiš pred tonama hladnog željeza?',
                        'updatedAt' => time()
                    ]
                ]
            ],
            [
                'id' => 'sec-persona',
                'title' => '03. PERSONA & GRČKA MITOLOGIJA: IRON MAIDEN',
                'navTitle' => '03. Persona & Mreže',
                'questions' => [
                    [
                        'id' => 'q7',
                        'num' => '07',
                        'text' => 'Tvoja serija mrežastih skulptura *Iron Maiden* (Čelična djeva) izravno se oslanja na grčki pojam *Persone* — kazališne maske. Koje sve maske ljudi nose u društvu i zašto si tu masku odlučio napraviti od varenih šipki?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q8',
                        'num' => '08',
                        'text' => 'Mrežasta struktura tvojih glava je prozirna — kroz nju se vidi prostor iza. Je li to maska koja skriva čovjeka ili rešetka koja ga razotkriva?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q9',
                        'num' => '09',
                        'text' => 'Kad je ta *Persona* u Varšavi dosegla 712.000 eura, jesi li osjetio da je tržište prepoznalo filozofsku ideju maske ili samo prestiž i materijalni objekt?',
                        'updatedAt' => time()
                    ]
                ]
            ],
            [
                'id' => 'sec-heraklo',
                'title' => '04. HERAKLOVI ZADACI: BORBA S NEDAĆAMA',
                'navTitle' => '04. Heraklovi zadaci',
                'questions' => [
                    [
                        'id' => 'q10',
                        'num' => '10',
                        'text' => 'Tvoj ciklus *Heraklovi zadaci* (Nemejski lav, Erimantski vepar...) bavi se antičkim mitološkim podvizima. Zbog čega si odabrao baš Herakla, a ne nekog mirnijeg antičkog heroja?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q11',
                        'num' => '11',
                        'text' => 'Svaki od tih 12 zadataka predstavlja neku nemoguću prepreku. Koji je tvoj osobni „Herkulov zadatak” bio najteži za savladati u životu i radioni?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q12',
                        'num' => '12',
                        'text' => 'Može li uopće nastati monumentalna umjetnost bez fizičke i mentalne borbe, ili je komfor ubojica velikih ideja?',
                        'updatedAt' => time()
                    ]
                ]
            ],
            [
                'id' => 'sec-prometej',
                'title' => '05. PROMETEJ, TESLA I MIT O VATRI',
                'navTitle' => '05. Prometej & Tesla',
                'questions' => [
                    [
                        'id' => 'q13',
                        'num' => '13',
                        'text' => 'Napravio si Teslu od 13 metara čelika ispred Tehnološkog parka. Vidiš li u Tesli modernog Prometeja koji je donio vatru ljudima, a na kraju ostao sam?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q14',
                        'num' => '14',
                        'text' => 'Zašto su tvoji motivi gotovo uvijek arhetipovi vatre, munje i transformacije energije — privlači li te ideja žrtve koju takvi geniji plaćaju?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q15',
                        'num' => '15',
                        'text' => 'Što moderna tehnologija (poput 3D skeniranja koje koristiš u radu) donosi klasičnom kiparstvu — pomaže li ideji ili prijeti da ubije dodir ruke?',
                        'updatedAt' => time()
                    ]
                ]
            ],
            [
                'id' => 'sec-kunst',
                'title' => '06. POJAM UMJETNOSTI (KUNST) I TRAJANJE',
                'navTitle' => '06. Kunst & Trajanje',
                'questions' => [
                    [
                        'id' => 'q16',
                        'num' => '16',
                        'text' => 'U renesansi se kiparstvo smatralo vrhuncem zanata i filozofije. Što je za tebe *Kunst* (umjetnost) danas — koncept, provokacija ili vještina da materiji udahneš oblik?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q17',
                        'num' => '17',
                        'text' => 'Corten čelik s godinama stvara koru hrđe i sam sebe štiti od propadanja. Je li prolaznost metala tvoja metafora za ljudsko tijelo i sjećanje?',
                        'updatedAt' => time()
                    ],
                    [
                        'id' => 'q18',
                        'num' => '18',
                        'text' => 'Kad se ugase svjetla galerija i nestane sav šušur oko aukcija, što je ona jedna misao zbog koje se svako jutro vraćaš u prašinu RezervArta na Dravi?',
                        'updatedAt' => time()
                    ]
                ]
            ]
        ],
        'activeSessions' => []
    ];
}

// Helper to recalculate sequential question numbering across all sections
function renumberQuestions(&$sections) {
    $counter = 1;
    foreach ($sections as &$sec) {
        if (!isset($sec['questions']) || !is_array($sec['questions'])) {
            $sec['questions'] = [];
        }
        foreach ($sec['questions'] as &$q) {
            $q['num'] = str_pad($counter, 2, '0', STR_PAD_LEFT);
            $counter++;
        }
    }
}

// Clean active sessions (older than 15s) and count active users
function updateActiveSessions(&$store, $sessionId) {
    $now = time();
    if (!isset($store['activeSessions']) || !is_array($store['activeSessions'])) {
        $store['activeSessions'] = [];
    }
    
    // Purge inactive (> 15s)
    foreach ($store['activeSessions'] as $id => $lastSeen) {
        if (($now - $lastSeen) > 15) {
            unset($store['activeSessions'][$id]);
        }
    }
    
    if ($sessionId) {
        $store['activeSessions'][$sessionId] = $now;
    }
    
    return count($store['activeSessions']);
}

// Open file with retry locking
$fp = fopen($dataFile, 'c+');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Cannot open storage file']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    http_response_code(503);
    echo json_encode(['status' => 'error', 'message' => 'Storage locked, please retry']);
    exit;
}

$raw = stream_get_contents($fp);
$store = !empty($raw) ? json_decode($raw, true) : null;
if (!$store || !isset($store['sections'])) {
    $store = getSeedData();
    renumberQuestions($store['sections']);
}

$method = $_SERVER['REQUEST_METHOD'];

// Handle GET request
if ($method === 'GET') {
    $sessionId = isset($_GET['sessionId']) ? cleanInputText($_GET['sessionId'], 100) : null;
    $clientVersion = isset($_GET['version']) ? intval($_GET['version']) : 0;
    
    $activeCount = updateActiveSessions($store, $sessionId);
    
    // Save updated active sessions back
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    
    $response = [
        'status' => 'success',
        'version' => $store['version'] ?? 1,
        'lastModified' => $store['lastModified'] ?? time(),
        'activeUsers' => max(1, $activeCount),
        'sections' => $store['sections']
    ];
    
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

// Handle POST request
if ($method === 'POST') {
    $bodyRaw = file_get_contents('php://input', false, null, 0, 102400);
    $payload = json_decode($bodyRaw, true);
    
    if (!$payload || !isset($payload['action'])) {
        flock($fp, LOCK_UN);
        fclose($fp);
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload']);
        exit;
    }
    
    $action = $payload['action'];
    $sessionId = isset($payload['sessionId']) ? cleanInputText($payload['sessionId'], 100) : null;
    $now = time();
    $mutated = false;
    
    if ($action === 'heartbeat') {
        $activeCount = updateActiveSessions($store, $sessionId);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        
        echo json_encode([
            'status' => 'success',
            'version' => $store['version'] ?? 1,
            'activeUsers' => max(1, $activeCount)
        ]);
        exit;
    }
    
    if ($action === 'update_question') {
        $qId = isset($payload['id']) ? cleanInputText($payload['id'], 64) : null;
        $newText = isset($payload['text']) ? cleanInputText($payload['text'], 5000) : '';
        
        if ($qId) {
            foreach ($store['sections'] as &$section) {
                if (!isset($section['questions']) || !is_array($section['questions'])) continue;
                foreach ($section['questions'] as &$question) {
                    if ($question['id'] === $qId) {
                        if ($question['text'] !== $newText) {
                            $question['text'] = $newText;
                            $question['updatedAt'] = $now;
                            $mutated = true;
                        }
                        break 2;
                    }
                }
            }
        }
    } elseif ($action === 'add_question') {
        $secId = isset($payload['sectionId']) ? cleanInputText($payload['sectionId'], 64) : null;
        $text = isset($payload['text']) ? cleanInputText($payload['text'], 5000) : 'Novo pitanje...';
        if (empty($text)) $text = 'Novo pitanje...';
        
        if ($secId) {
            foreach ($store['sections'] as &$section) {
                if ($section['id'] === $secId) {
                    if (!isset($section['questions']) || !is_array($section['questions'])) {
                        $section['questions'] = [];
                    }
                    $newId = 'q_' . substr(md5(uniqid((string)rand(), true)), 0, 8);
                    $section['questions'][] = [
                        'id' => $newId,
                        'num' => '00',
                        'text' => $text,
                        'updatedAt' => $now
                    ];
                    $mutated = true;
                    break;
                }
            }
            if ($mutated) {
                renumberQuestions($store['sections']);
            }
        }
    } elseif ($action === 'delete_question') {
        $qId = isset($payload['id']) ? cleanInputText($payload['id'], 64) : null;
        if ($qId) {
            foreach ($store['sections'] as &$section) {
                if (!isset($section['questions']) || !is_array($section['questions'])) continue;
                $initialCount = count($section['questions']);
                $section['questions'] = array_values(array_filter($section['questions'], function($q) use ($qId) {
                    return $q['id'] !== $qId;
                }));
                if (count($section['questions']) !== $initialCount) {
                    $mutated = true;
                }
            }
            if ($mutated) {
                renumberQuestions($store['sections']);
            }
        }
    } elseif ($action === 'reorder') {
        $secId = isset($payload['sectionId']) ? cleanInputText($payload['sectionId'], 64) : null;
        $orderedIds = isset($payload['questionIds']) && is_array($payload['questionIds']) ? $payload['questionIds'] : [];
        
        if ($secId && !empty($orderedIds)) {
            foreach ($store['sections'] as &$section) {
                if ($section['id'] === $secId) {
                    $lookup = [];
                    foreach ($section['questions'] as $q) {
                        $lookup[$q['id']] = $q;
                    }
                    $reordered = [];
                    foreach ($orderedIds as $oid) {
                        $cleanOid = cleanInputText($oid, 64);
                        if (isset($lookup[$cleanOid])) {
                            $reordered[] = $lookup[$cleanOid];
                            unset($lookup[$cleanOid]);
                        }
                    }
                    // Append any remaining questions
                    foreach ($lookup as $rem) {
                        $reordered[] = $rem;
                    }
                    $section['questions'] = $reordered;
                    $mutated = true;
                    break;
                }
            }
            if ($mutated) {
                renumberQuestions($store['sections']);
            }
        }
    } elseif ($action === 'reset_default') {
        $store = getSeedData();
        renumberQuestions($store['sections']);
        $mutated = true;
    }
    
    if ($mutated) {
        $store['version'] = ($store['version'] ?? 1) + 1;
        $store['lastModified'] = $now;
    }
    
    $activeCount = updateActiveSessions($store, $sessionId);
    
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    
    echo json_encode([
        'status' => 'success',
        'mutated' => $mutated,
        'version' => $store['version'] ?? 1,
        'lastModified' => $store['lastModified'] ?? $now,
        'activeUsers' => max(1, $activeCount),
        'sections' => $store['sections']
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

flock($fp, LOCK_UN);
fclose($fp);
http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
