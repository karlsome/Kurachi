// i18n.js - Internationalization support for Kurachi application
// Supports Japanese (ja), English (en), and Portuguese (pt)

const translations = {
    ja: {
        // Common
        'home': 'Home',
        'factory': '工場',
        'equipment': '設備',
        'daily_report': '日報',
        'reset': 'Reset',
        'submit': 'Submit',
        'cancel': 'Cancel',
        'close': 'Close',
        'print': 'Print Label',
        'confirm': 'Confirm',
        'scan': 'Scan',
        'capture': 'Capture',
        'yes': 'はい',
        'no': 'いいえ',

        // DCP iReporter specific
        'sending_to_machine': 'マシンにデータを送信中',
        'send_to_machine': 'Send to Machine',
        'worker_name': '作業者:',
        'worker_name_placeholder': "Worker's Name",
        'process_quantity': '加工数（良品）+ NG:',
        'process_quantity_placeholder': 'Process Quantity',
        'one_box_completed': '1 box completed',
        'processing_date': '加工日:',
        'start_time': '加工開始時間:',
        'time_start_placeholder': 'Time Start',
        'end_time': '加工終了時間:',
        'time_end_placeholder': 'Time End',
        'shot_count': 'ショット数',
        'shot_count_placeholder': 'ショット数',
        'material_lot': '材料ロット:',
        'material_lot_placeholder': 'Material Lot',
        'defect_pull': '疵引不良',
        'processing_defect': '加工不良',
        'other': 'その他:',
        'comments': 'Enter Comments',
        'first_cycle_check': '初物チェック:',
        'check_first_cycle': 'Check 1st Cycle',
        'last_cycle_check': '終物チェック:',
        'check_last_cycle': 'Check Last Cycle',
        'material_label': '材料ラベル:',
        'take_photo': '写真撮影',
        'kensa_checkbox': '倉知検査',
        'inspector_name': '検査者:',
        'inspector_placeholder': 'Kensa Name',
        'inspection_date': '検査日付:',
        'inspection_start_time': '検査開始時間:',
        'inspection_end_time': '検査終了時間:',
        'ng_quantity': 'NG Quantity:',
        'total_good': '良品合計(TOTAL):',
        'spare': 'スペア:',
        'spare_placeholder': 'Spare',
        'product_number': 'Product Number:',
        'model': 'Model:',
        'shape': 'Shape:',
        'material': 'Material:',
        'material_code': 'Material Code:',
        'material_color': 'Material Color:',
        'kataban': '型番:',
        'total_time': 'Total Time (in hours):',
        'cycle_time_dcp': 'Cycle Time DCP:',
        'cycle_time_kensa': 'Cycle Time Kensa:',
        'breaktime': 'Breaktime(mins):',
        'trouble_time': '故障時間:',
        'break_time_title': '休憩時間',
        'break_1': '休憩1:',
        'break_2': '休憩2:',
        'break_3': '休憩3:',
        'break_4': '休憩4:',
        'total_break_time': '合計休憩時間:',
        'machine_trouble_title': '機械故障時間 / Machine Maintenance Time',
        'add_maintenance': '➕ 機械故障時間を追加 / Add Maintenance Time',
        'total_trouble_time': '合計故障時間:',
        'equipment_name': '設備名:',
        'scan_sebango': 'Scan 背番号',
        'scan_lot': 'Scan ロット',

        // Modal messages
        'wrong_kanban': 'Wrong Kanban / 看板間違い',
        'different_product': '異なる製品が検出されました。保存してください！',
        'scan_qr_sebango': '背番号をスキャンしてください',
        'scan_qr_sebango_en': 'Please scan product QR code',
        'scan_material_lot': '材料ロットをスキャンしてください',
        'scan_material_lot_en': 'Please scan material lot QR code',
        'override_manual': 'Override (Manual Entry) / 手動入力',
        'leader_verification_warning': '価値観を変えることができるのはリーダーだけ',
        'leader_verification_only': 'Only leaders can change value',
        'scan_leader_qr': 'リーダーのQRコードをスキャンしてください',
        'scan_leader_qr_en': 'Please scan leader QR code',
        'step_1_scan_kanban': 'Step 1: SCAN Kanban / スキャン看板',
        'press_button': 'Press this button / このボタンを押して',
        'scan_kanban': 'Scan Kanban',
        'scan_kanban_ja': 'スキャン看板',
        'step_2_scan_material': 'Step 2: SCAN Material / スキャン材料',
        'scan_lot_no': 'Scan Lot. No.',
        'scan_lot_no_ja': 'スキャンロット',
        'override': 'Override / 手動',
        'step_3_send_machine': 'Step 3: send to Machine / データ送信',
        'send_to_machine_btn': 'Send to machine',
        'uploading': 'Uploading, please wait...',
        'warning': 'Warning!',
        'sebango': '背番号:',
        'hinban': '品番:',
        'material_label_ja': '材料:',

        // firstKojoLabelPrinter specific
        'label_printer': 'ラベルプリンター',
        'choose_scan_method': 'Choose Scan Method',
        'camera_scan': '📷 カメラ用',
        'bluetooth_scanner': '🛜🖲️ ブルースス スキャナー',
        'scan_qr_code': 'Scan QR Code',
        'waiting_scan': 'QR スキャンお待ち中 (Waiting for SCAN)...',
        'scan_now': 'スキャンしてください。Scan QR Now!',
        'error': 'Error',
        'select_production_order': '複数の生産順番が見つかりました',
        'select_production_order_en': 'Select Production Order',
        'multiple_orders_msg': '同じ品番で複数の生産順番があります。どちらを選択しますか？',
        'multiple_orders_msg_en': 'Multiple production orders found for the same product number. Which one would you like to select?',
        'print_confirmation': 'Print Confirmation',
        'how_many_labels': 'How many labels do you want to print?',
        'printing': 'Printing...',
        'please_wait_printing': 'Please wait while the labels are being printed.',
        'cancel_printing': 'Cancel Printing',
        'print_complete': 'Print Complete',
        'print_success': 'All labels have been printed successfully.',
        'product_code_label': '品番:',
        'scan_nippo': '📷 Scan 日報',
        'date_label': '日付 (Date):',
        'material_label_photo': '材料ラベル写真 (Material Label Photos)',
        'take_material_photo': '📷 材料ラベルを撮影',
        'print_label': '🖨 Print Label',
        'raw_material_number': '原材料品番 (Raw Material Product Number):',
        'reprint_label': '🔄 Reprint Label / 再印刷',
        'status': 'STATUS:',
        'print_progress': '印刷進捗 (Print Progress):',
        'material_sebango': '材料背番号 (Product Code):',
        'product_name': '品名 (Product Number):',
        'material_color_label': '材料の色 (Material Color):',
        'specification': '仕様 (Specification):',
        'reset_btn': '🗑️ Reset',
        'reprint_modal_title': 'Reprint Label',
        'select_suffix': 'Select Lot No. Suffix:',
        'reprint_this_label': 'Reprint This Label',
        'take_picture_camera': 'カメラで撮影 (Take Picture with Camera)',
        'capture_btn': '撮影 (Capture)',
        'close_btn': '閉じる (Close)',
        'confirm_reset_warning': '⚠️ 警告 / WARNING ⚠️\n\nすべてのデータがリセットされます。\nAll data will be reset.\n\n本当にリセットしますか？\nAre you sure you want to reset?',
        'data_reset_success': 'データがリセットされました。ページを更新します。\n(Data has been reset. Refreshing page...)',
        'minutes': '分',
        'false_label': 'FALSE',
        'rikeshi_paper': '離型紙:',
        'sending_pitch': '送りピッチ',
    },

    en: {
        // Common
        'home': 'Home',
        'factory': 'Factory',
        'equipment': 'Equipment',
        'daily_report': 'Daily Report',
        'reset': 'Reset',
        'submit': 'Submit',
        'cancel': 'Cancel',
        'close': 'Close',
        'print': 'Print Label',
        'confirm': 'Confirm',
        'scan': 'Scan',
        'capture': 'Capture',
        'yes': 'Yes',
        'no': 'No',

        // DCP iReporter specific
        'sending_to_machine': 'Sending data to PC',
        'send_to_machine': 'Send to Machine',
        'worker_name': 'Worker Name:',
        'worker_name_placeholder': "Worker's Name",
        'process_quantity': 'Process Quantity (Good) + NG:',
        'process_quantity_placeholder': 'Process Quantity',
        'one_box_completed': '1 box completed',
        'processing_date': 'Processing Date:',
        'start_time': 'Start Time:',
        'time_start_placeholder': 'Time Start',
        'end_time': 'End Time:',
        'time_end_placeholder': 'Time End',
        'shot_count': 'Shot Count',
        'shot_count_placeholder': 'Shot Count',
        'material_lot': 'Material Lot:',
        'material_lot_placeholder': 'Material Lot',
        'defect_pull': 'Material Defect',
        'processing_defect': 'Processing Defect',
        'other': 'Other:',
        'comments': 'Enter Comments',
        'first_cycle_check': 'First Cycle Check:',
        'check_first_cycle': 'Check 1st Cycle',
        'last_cycle_check': 'Last Cycle Check:',
        'check_last_cycle': 'Check Last Cycle',
        'material_label': 'Material Label:',
        'take_photo': 'Take Photo',
        'kensa_checkbox': 'Kurachi Inspection',
        'inspector_name': 'Inspector Name:',
        'inspector_placeholder': 'Inspector Name',
        'inspection_date': 'Inspection Date:',
        'inspection_start_time': 'Inspection Start Time:',
        'inspection_end_time': 'Inspection End Time:',
        'ng_quantity': 'NG Quantity:',
        'total_good': 'Total Good (TOTAL):',
        'spare': 'Spare:',
        'spare_placeholder': 'Spare',
        'product_number': 'Product Number:',
        'model': 'Model:',
        'shape': 'Shape:',
        'material': 'Material:',
        'material_code': 'Material Code:',
        'material_color': 'Material Color:',
        'kataban': 'Model Number:',
        'total_time': 'Total Time (in hours):',
        'cycle_time_dcp': 'Cycle Time DCP:',
        'cycle_time_kensa': 'Cycle Time Inspection:',
        'breaktime': 'Break Time (mins):',
        'trouble_time': 'Trouble Time:',
        'break_time_title': 'Break Time',
        'break_1': 'Break 1:',
        'break_2': 'Break 2:',
        'break_3': 'Break 3:',
        'break_4': 'Break 4:',
        'total_break_time': 'Total Break Time:',
        'machine_trouble_title': 'Machine Maintenance Time',
        'add_maintenance': '➕ Add Maintenance Time',
        'total_trouble_time': 'Total Trouble Time:',
        'equipment_name': 'Equipment Name:',
        'scan_sebango': 'Scan Product Code',
        'scan_lot': 'Scan Lot',

        // Modal messages
        'wrong_kanban': 'Wrong Kanban',
        'different_product': 'Different product detected! Please save form before changing.',
        'scan_qr_sebango': 'Please scan product QR code',
        'scan_qr_sebango_en': '',
        'scan_material_lot': 'Please scan material lot QR code',
        'scan_material_lot_en': '',
        'override_manual': 'Override (Manual Entry)',
        'leader_verification_warning': 'Only leaders can change value',
        'leader_verification_only': '',
        'scan_leader_qr': 'Please scan leader QR code',
        'scan_leader_qr_en': '',
        'step_1_scan_kanban': 'Step 1: SCAN Kanban',
        'press_button': 'Press this button',
        'scan_kanban': 'Scan Kanban',
        'scan_kanban_ja': '',
        'step_2_scan_material': 'Step 2: SCAN Material',
        'scan_lot_no': 'Scan Lot. No.',
        'scan_lot_no_ja': '',
        'override': 'Override',
        'step_3_send_machine': 'Step 3: send to Machine',
        'send_to_machine_btn': 'Send to machine',
        'uploading': 'Uploading, please wait...',
        'warning': 'Warning!',
        'sebango': 'Product Code:',
        'hinban': 'Product Number:',
        'material_label_ja': 'Material:',

        // firstKojoLabelPrinter specific
        'label_printer': 'Label Printer',
        'choose_scan_method': 'Choose Scan Method',
        'camera_scan': '📷 Camera Scan',
        'bluetooth_scanner': '🛜🖲️ Bluetooth Scanner',
        'scan_qr_code': 'Scan QR Code',
        'waiting_scan': 'Waiting for SCAN...',
        'scan_now': 'Scan QR Now!',
        'error': 'Error',
        'select_production_order': 'Select Production Order',
        'select_production_order_en': '',
        'multiple_orders_msg': 'Multiple production orders found for the same product number. Which one would you like to select?',
        'multiple_orders_msg_en': '',
        'print_confirmation': 'Print Confirmation',
        'how_many_labels': 'How many labels do you want to print?',
        'printing': 'Printing...',
        'please_wait_printing': 'Please wait while the labels are being printed.',
        'cancel_printing': 'Cancel Printing',
        'print_complete': 'Print Complete',
        'print_success': 'All labels have been printed successfully.',
        'product_code_label': 'Product Code:',
        'scan_nippo': '📷 Scan Daily Report',
        'date_label': 'Date:',
        'material_label_photo': 'Material Label Photos',
        'take_material_photo': '📷 Take Material Label Photo',
        'print_label': '🖨 Print Label',
        'raw_material_number': 'Raw Material Product Number:',
        'reprint_label': '🔄 Reprint Label',
        'status': 'STATUS:',
        'print_progress': 'Print Progress:',
        'material_sebango': 'Product Code:',
        'product_name': 'Product Name:',
        'material_color_label': 'Material Color:',
        'specification': 'Specification:',
        'reset_btn': '🗑️ Reset',
        'reprint_modal_title': 'Reprint Label',
        'select_suffix': 'Select Lot No. Suffix:',
        'reprint_this_label': 'Reprint This Label',
        'take_picture_camera': 'Take Picture with Camera',
        'capture_btn': 'Capture',
        'close_btn': 'Close',
        'confirm_reset_warning': '⚠️ WARNING ⚠️\n\nAll data will be reset.\n\nAre you sure you want to reset?',
        'data_reset_success': 'Data has been reset. Refreshing page...',
        'minutes': 'mins',
        'false_label': 'FALSE',
        'rikeshi_paper': 'Release Paper:',
        'sending_pitch': 'Feeding Pitch',
    },

    pt: {
        // Common
        'home': 'Início',
        'factory': 'Fábrica',
        'equipment': 'Equipamento',
        'daily_report': 'Relatório Diário',
        'reset': 'Reiniciar',
        'submit': 'Enviar',
        'cancel': 'Cancelar',
        'close': 'Fechar',
        'print': 'Imprimir Etiqueta',
        'confirm': 'Confirmar',
        'scan': 'Escanear',
        'capture': 'Capturar',
        'yes': 'Sim',
        'no': 'Não',

        // DCP iReporter specific
        'sending_to_machine': 'Enviando dados para o PC',
        'send_to_machine': 'Enviar para Máquina',
        'worker_name': 'Nome do Trabalhador:',
        'worker_name_placeholder': 'Nome do Trabalhador',
        'process_quantity': 'Quantidade Processada (Boa) + NG:',
        'process_quantity_placeholder': 'Quantidade Processada',
        'one_box_completed': '1 caixa concluída',
        'processing_date': 'Data de Processamento:',
        'start_time': 'Hora de Início:',
        'time_start_placeholder': 'Hora de Início',
        'end_time': 'Hora de Término:',
        'time_end_placeholder': 'Hora de Término',
        'shot_count': 'Contagem de Disparos',
        'shot_count_placeholder': 'Contagem de Disparos',
        'material_lot': 'Lote de Material:',
        'material_lot_placeholder': 'Lote de Material',
        'defect_pull': 'Defeito de Puxada',
        'processing_defect': 'Defeito de Processamento',
        'other': 'Outro:',
        'comments': 'Inserir Comentários',
        'first_cycle_check': 'Verificação do Primeiro Ciclo:',
        'check_first_cycle': 'Verificar 1º Ciclo',
        'last_cycle_check': 'Verificação do Último Ciclo:',
        'check_last_cycle': 'Verificar Último Ciclo',
        'material_label': 'Etiqueta de Material:',
        'take_photo': 'Tirar Foto',
        'kensa_checkbox': 'Inspeção Kurachi',
        'inspector_name': 'Nome do Inspetor:',
        'inspector_placeholder': 'Nome do Inspetor',
        'inspection_date': 'Data de Inspeção:',
        'inspection_start_time': 'Hora de Início da Inspeção:',
        'inspection_end_time': 'Hora de Término da Inspeção:',
        'ng_quantity': 'Quantidade NG:',
        'total_good': 'Total Bom (TOTAL):',
        'spare': 'Reserva:',
        'spare_placeholder': 'Reserva',
        'product_number': 'Número do Produto:',
        'model': 'Modelo:',
        'shape': 'Forma:',
        'material': 'Material:',
        'material_code': 'Código do Material:',
        'material_color': 'Cor do Material:',
        'kataban': 'Número do Modelo:',
        'total_time': 'Tempo Total (em horas):',
        'cycle_time_dcp': 'Tempo de Ciclo DCP:',
        'cycle_time_kensa': 'Tempo de Ciclo Inspeção:',
        'breaktime': 'Tempo de Intervalo (min):',
        'trouble_time': 'Tempo de Problema:',
        'break_time_title': 'Tempo de Intervalo',
        'break_1': 'Intervalo 1:',
        'break_2': 'Intervalo 2:',
        'break_3': 'Intervalo 3:',
        'break_4': 'Intervalo 4:',
        'total_break_time': 'Tempo Total de Intervalo:',
        'machine_trouble_title': 'Tempo de Manutenção da Máquina',
        'add_maintenance': '➕ Adicionar Tempo de Manutenção',
        'total_trouble_time': 'Tempo Total de Problema:',
        'equipment_name': 'Nome do Equipamento:',
        'scan_sebango': 'Escanear Código do Produto',
        'scan_lot': 'Escanear Lote',

        // Modal messages
        'wrong_kanban': 'Kanban Errado',
        'different_product': 'Produto diferente detectado! Por favor, salve o formulário antes de mudar.',
        'scan_qr_sebango': 'Por favor, escaneie o código QR do produto',
        'scan_qr_sebango_en': '',
        'scan_material_lot': 'Por favor, escaneie o código QR do lote de material',
        'scan_material_lot_en': '',
        'override_manual': 'Substituir (Entrada Manual)',
        'leader_verification_warning': 'Apenas líderes podem alterar o valor',
        'leader_verification_only': '',
        'scan_leader_qr': 'Por favor, escaneie o código QR do líder',
        'scan_leader_qr_en': '',
        'step_1_scan_kanban': 'Passo 1: ESCANEAR Kanban',
        'press_button': 'Pressione este botão',
        'scan_kanban': 'Escanear Kanban',
        'scan_kanban_ja': '',
        'step_2_scan_material': 'Passo 2: ESCANEAR Material',
        'scan_lot_no': 'Escanear Nº do Lote',
        'scan_lot_no_ja': '',
        'override': 'Substituir',
        'step_3_send_machine': 'Passo 3: enviar para Máquina',
        'send_to_machine_btn': 'Enviar para máquina',
        'uploading': 'Enviando, por favor aguarde...',
        'warning': 'Aviso!',
        'sebango': 'Código do Produto:',
        'hinban': 'Número do Produto:',
        'material_label_ja': 'Material:',

        // firstKojoLabelPrinter specific
        'label_printer': 'Impressora de Etiquetas',
        'choose_scan_method': 'Escolha o Método de Escaneamento',
        'camera_scan': '📷 Escanear com Câmera',
        'bluetooth_scanner': '🛜🖲️ Scanner Bluetooth',
        'scan_qr_code': 'Escanear Código QR',
        'waiting_scan': 'Aguardando ESCANEAMENTO...',
        'scan_now': 'Escaneie o QR Agora!',
        'error': 'Erro',
        'select_production_order': 'Selecione a Ordem de Produção',
        'select_production_order_en': '',
        'multiple_orders_msg': 'Várias ordens de produção encontradas para o mesmo número de produto. Qual você gostaria de selecionar?',
        'multiple_orders_msg_en': '',
        'print_confirmation': 'Confirmação de Impressão',
        'how_many_labels': 'Quantas etiquetas você deseja imprimir?',
        'printing': 'Imprimindo...',
        'please_wait_printing': 'Por favor, aguarde enquanto as etiquetas estão sendo impressas.',
        'cancel_printing': 'Cancelar Impressão',
        'print_complete': 'Impressão Concluída',
        'print_success': 'Todas as etiquetas foram impressas com sucesso.',
        'product_code_label': 'Código do Produto:',
        'scan_nippo': '📷 Escanear Relatório Diário',
        'date_label': 'Data:',
        'material_label_photo': 'Fotos da Etiqueta de Material',
        'take_material_photo': '📷 Tirar Foto da Etiqueta de Material',
        'print_label': '🖨 Imprimir Etiqueta',
        'raw_material_number': 'Número do Produto da Matéria-Prima:',
        'reprint_label': '🔄 Reimprimir Etiqueta',
        'status': 'STATUS:',
        'print_progress': 'Progresso da Impressão:',
        'material_sebango': 'Código do Produto:',
        'product_name': 'Nome do Produto:',
        'material_color_label': 'Cor do Material:',
        'specification': 'Especificação:',
        'reset_btn': '🗑️ Reiniciar',
        'reprint_modal_title': 'Reimprimir Etiqueta',
        'select_suffix': 'Selecione o Sufixo do Nº do Lote:',
        'reprint_this_label': 'Reimprimir Esta Etiqueta',
        'take_picture_camera': 'Tirar Foto com a Câmera',
        'capture_btn': 'Capturar',
        'close_btn': 'Fechar',
        'confirm_reset_warning': '⚠️ AVISO ⚠️\n\nTodos os dados serão reiniciados.\n\nTem certeza de que deseja reiniciar?',
        'data_reset_success': 'Os dados foram reiniciados. Atualizando a página...',
        'minutes': 'min',
        'false_label': 'FALSO',
        'rikeshi_paper': 'Papel de Liberação:',
        'sending_pitch': 'Passo de Alimentação',
    }
};

// Get current language from localStorage or default to Japanese
function getCurrentLanguage() {
    return localStorage.getItem('appLanguage') || 'ja';
}

// Set current language and save to localStorage
function setLanguage(lang) {
    if (translations[lang]) {
        localStorage.setItem('appLanguage', lang);
        applyTranslations(lang);

        // Update the language selector dropdown
        const languageSelector = document.getElementById('languageSelector');
        if (languageSelector) {
            languageSelector.value = lang;
        }
    }
}

// Apply translations to the page
function applyTranslations(lang) {
    const t = translations[lang];

    // Translate all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (t[key]) {
            // Check if element is an input/textarea with placeholder
            if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && element.hasAttribute('placeholder')) {
                element.placeholder = t[key];
            } else if (element.tagName === 'INPUT' && element.type !== 'hidden') {
                element.value = t[key];
            } else {
                element.textContent = t[key];
            }
        }
    });

    // Translate all elements with data-i18n-title attribute (for titles/tooltips)
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        if (t[key]) {
            element.title = t[key];
        }
    });

    // Translate document title if it has data-i18n
    const titleElement = document.querySelector('title');
    if (titleElement && titleElement.hasAttribute('data-i18n')) {
        const key = titleElement.getAttribute('data-i18n');
        if (t[key]) {
            titleElement.textContent = t[key];
        }
    }

    console.log(`Language changed to: ${lang}`);
}

// Initialize language on page load
function initLanguage() {
    const currentLang = getCurrentLanguage();
    const languageSelector = document.getElementById('languageSelector');

    if (languageSelector) {
        languageSelector.value = currentLang;

        // Add event listener for language changes
        languageSelector.addEventListener('change', (e) => {
            setLanguage(e.target.value);
        });
    }

    // Apply translations
    applyTranslations(currentLang);
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
} else {
    initLanguage();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translations, getCurrentLanguage, setLanguage, applyTranslations };
}
