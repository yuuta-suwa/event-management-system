# LEGACY - Generates v2.0 only. Do not run for current v2.3 specifications.
import json
from pathlib import Path
base = Path(__file__).resolve().parent
sections = [
('values','08:00-18:00'),('desire','18:00-28:00'),('goal','28:00-39:00'),
('incident','39:00-49:00'),('plan','49:00-56:00'),('start','56:00-60:00')]
q_data = [
('Q01','values','今、一番変えたい現実は何ですか？','select_or_text',['収入','仕事','事業','人間関係','健康','方向性','その他','答えたくない'],0),
('Q02','values','あなたは、どんな生き方を大切にしたいですか？','multi_or_text',['人への貢献','自由','成長','誠実','家族','挑戦','安定','その他','まだ分からない'],0),
('Q03','values','その大切なことを、最近の生活で感じた場面はありますか？','text',[],0),
('Q04','desire','変えたい理由は、あなた自身の望みですか？','single',['自分の意思','周囲の期待','混在','分からない'],0),
('Q05','desire','望む未来を考えたとき、期待することと負担を感じることは何ですか？','multi_or_text',['ワクワク','可能性','失敗への不安','期限へのプレッシャー','義務感','他者評価','負担はない','分からない'],0),
('Q06','desire','その目標を明確にすることや、人に話すことに抵抗がありますか？','single',['明確化に抵抗','人に話すことに抵抗','両方に抵抗','特になし','分からない'],0),
('Q07','goal','現在の状態に最も近いものを選んでください。','route',['explore','protect','plan','execute'],1),
('Q08','goal','この14日間で何を少し前進させたいですか？','experiment_theme',[],1),
('Q09','goal','14日後、何が起きていれば前進したと分かりますか？','evidence_plan',[],0),
('Q10','incident','最近、重要だと思っていたのに予定どおりできなかったことはありますか？','text_or_none',[],0),
('Q11','incident','そのとき、実際には何をしましたか？','single',['予定どおり実行','別作業','突発対応','休息','何もしなかった','不明'],0),
('Q12','incident','その直前に考えたことや感じたことはありますか？','multi_or_text',['不安','面倒','義務感','失敗への怖さ','方法不明','疲労','何もなし','不明'],0),
('Q13','incident','その直後に何が起きましたか？','single',['安心','達成感','成果が出た','負担が増した','変化なし','不明'],0),
('Q14','incident','行動を妨げる原因として何が関係していそうですか？（最大2つ）','multi',['value_gap','self_worth','method_gap','low_efficacy','avoidance','opportunity','urgency','overload','unknown'],0),
('Q15','plan','今日か明日、最も大切な一歩として何を実行しますか？','action',[],1),
('Q16','plan','いつ、どんな状況になったら、その一歩を始めますか？','if_then',[],1),
('Q17','plan','もし妨げが出たらどう対応し、何を記録しますか？','backup_and_evidence',[],0),
('Q18','start','今、最初の2分を試しますか？','single',['着手した','後で開始する','休息する'],0),
]
time_map={k:t for k,t in sections}
questions=[]
labels={'explore':'方向性を探している','protect':'望みはあるが明確化や公開が負担','plan':'目標はあるが方法・計画が分からない','execute':'計画はあるが実行しにくい','value_gap':'目標への納得感が低い','self_worth':'自己評価や公開への不安','method_gap':'やり方が分からない','low_efficacy':'できる見込みが持てない','avoidance':'不快な気持ちを避けたい','opportunity':'時間・環境が整わない','urgency':'目先の緊急そうな作業が優先される','overload':'負荷や疲労が大きい','unknown':'まだ分からない'}
for id,section,label,kind,opts,req in q_data:
    questions.append({'id':id,'section':section,'timeWindow':time_map[section],
                      'label':label,'inputType':kind,'options':opts,
                      'requiredToFinalize':bool(req),'maySkip':not bool(req),
                      'privacy':'private','interpretation':'self_report_not_diagnosis',
                      'optionLabels':{v:labels[v] for v in opts if v in labels},
                      **({'maxSelections':2} if id=='Q14' else {})})
branches=[
{'route':'explore','labels':['A1','A2'],'prompts':['最近充実した経験や興味を持った活動は何ですか？','14日間に、何を実際に体験して確かめますか？'], 'output':'探索行動・具体的な観察記録'},
{'route':'protect','labels':['B1','B2'],'prompts':['目標を明確にしたり公開したりすると何が負担ですか？','誰にも公開せず仮の目標を試すなら、何を一つできますか？'], 'output':'非公開の仮目標・小行動'},
{'route':'plan','labels':['C1','C2'],'prompts':['最初の方法が分からない、全体が分からない、できる見込みがない、のどれですか？','どの情報や経験が得られたら方法が少し分かったと言えますか？'], 'output':'学習実験・結果証拠'},
{'route':'execute','labels':['D1','D2'],'prompts':['実行する瞬間、どんな妨げが起きやすいですか？','開始できる時間・場所・環境をどう用意しますか？'], 'output':'最重要行動・開始条件・対応策'},
]
question_bank={'version':'2.0','locale':'ja-JP','workshopMinutes':60,
               'introMinutes':8,'workMinutes':52,'questions':questions,
               'branches':branches,'maxBranchQuestionsPerPerson':2,
               'notes':['人生理念・感情・収入は必須にしない','ルートは人間の性格分類ではない',
                        '公開は初期状態でしない','Q08/Q15/Q16は途中保存なら空欄可、完了時には必要']}
(base/'QUESTION_BANK.json').write_text(json.dumps(question_bank,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

schema={
'$schema':'https://json-schema.org/draft/2020-12/schema',
'$id':'https://schemas.metaevo-shift.invalid/exports/v2.json',
'$comment':'This URL is a placeholder for schema identity, not a network endpoint.',
'title':'MetaEVO Shift local data export schema v2.0', 'type':'object',
'required':['schemaVersion','createdAt','preferences','workshop','goals','experiments','dayPlans','events','evidence','reviews'],
'properties':{
 'schemaVersion':{'const':'2.0'},
 'createdAt':{'type':'string','format':'date-time'},
 'preferences':{'type':'object','required':['timeZone','dataSharing'],
   'properties':{'timeZone':{'type':'string'},'dataSharing':{'const':'private'},'lastBackupAt':{'type':['string','null'],'format':'date-time'},'displayTheme':{'enum':['dark','light','system']}}},
 'profile':{'type':'object','properties':{'currentChallenge':{'type':['string','null']},'valueDrafts':{'type':'array','items':{'type':'string'}},'motivations':{'type':'array','items':{'type':'string'}},'sharingResistance':{'type':['string','null']},'selectedRoute':{'enum':['explore','protect','plan','execute']}}},
 'workshop':{'type':'object','required':['status','answers'],
   'properties':{'status':{'enum':['not_started','in_progress','completed']},'startedAt':{'type':['string','null'],'format':'date-time'},'completedAt':{'type':['string','null'],'format':'date-time'},'answers':{'type':'object','additionalProperties':{'type':['string','number','boolean','null','array','object']}},'selectedRoute':{'enum':['explore','protect','plan','execute']},'initialExperimentId':{'type':['string','null']}}},
 'goals':{'type':'array','items':{'$ref':'#/$defs/goal'}},
 'experiments':{'type':'array','items':{'$ref':'#/$defs/experiment'}},
 'dayPlans':{'type':'array','items':{'$ref':'#/$defs/dayPlan'}},
 'events':{'type':'array','items':{'$ref':'#/$defs/event'}},
 'evidence':{'type':'array','items':{'$ref':'#/$defs/evidence'}},
 'reviews':{'type':'array','items':{'$ref':'#/$defs/review'}}
 },
 '$defs':{
 'goal':{'type':'object','required':['id','status','title','sharing','createdAt'],
         'properties':{'id':{'type':'string'},'status':{'enum':['exploring','provisional','committed','paused','retired']},'title':{'type':'string'},'purpose':{'type':['string','null']},'targetDate':{'type':['string','null'],'format':'date'},'sharing':{'const':'private'},'createdAt':{'type':'string','format':'date-time'},'revisedAt':{'type':['string','null'],'format':'date-time'},'outcomeMeasureId':{'type':['string','null']}}},
 'experiment':{'type':'object','required':['id','route','theme','experimentKind','firstAction','startCue','startDate','endDate','status'],
         'properties':{'id':{'type':'string'},'route':{'enum':['explore','protect','plan','execute']},'theme':{'type':'string'},'experimentKind':{'enum':['exploration','learning','execution']},'firstAction':{'type':'string'},'startCue':{'type':'string'},'fallbackPlan':{'type':['string','null']},'startDate':{'type':'string','format':'date'},'endDate':{'type':'string','format':'date'},'status':{'enum':['draft','active','completed','paused','retired']},'hypothesisIds':{'type':'array','items':{'type':'string'}},'evidenceMeasureIds':{'type':'array','items':{'type':'string'}}}},
 'dayPlan':{'type':'object','required':['id','localDate','dayMode','status'],
          'properties':{'id':{'type':'string'},'localDate':{'type':'string','format':'date'},'dayMode':{'enum':['advance','prepare','recover']},'status':{'enum':['unplanned','planned','in_progress','paused','completed','not_started','changed','rest','unknown']},'experimentId':{'type':['string','null']},'importantAction':{'type':['string','null']},'startCue':{'type':['string','null']},'plannedMinutes':{'type':['number','null'],'minimum':0},'plannedAt':{'type':['string','null'],'format':'date-time'},'note':{'type':['string','null']}}},
 'event':{'type':'object','required':['id','kind','occurredAt','localDate'],
          'properties':{'id':{'type':'string'},'kind':{'enum':['PLAN_CREATED','ACTION_STARTED','ACTION_PAUSED','ACTION_COMPLETED','INTERNAL_SWITCH','EXTERNAL_INTERRUPT','ACTION_RESUMED','REPLAN','REST_CHOSEN','DAILY_REVIEW','HYPOTHESIS_REVISED','GOAL_REVISED','EVIDENCE_ADDED']},'occurredAt':{'type':'string','format':'date-time'},'localDate':{'type':'string','format':'date'},'planId':{'type':['string','null']},'payload':{'type':'object'},'updatedAt':{'type':['string','null'],'format':'date-time'}}},
 'evidence':{'type':'object','required':['id','layer','observedAt','description'],
          'properties':{'id':{'type':'string'},'layer':{'enum':['action','learning','outcome','alignment']},'observedAt':{'type':'string','format':'date-time'},'description':{'type':'string'},'goalId':{'type':['string','null']},'experimentId':{'type':['string','null']},'quantity':{'type':['number','null']},'unit':{'type':['string','null']},'baselineQuantity':{'type':['number','null']},'source':{'enum':['self_report','record','external_document','other']}}},
 'review':{'type':'object','required':['id','reviewKind','reviewedAt'],
          'properties':{'id':{'type':'string'},'reviewKind':{'enum':['day7','day14','day30','day60','day90','daily','custom']},'reviewedAt':{'type':'string','format':'date-time'},'periodStart':{'type':['string','null'],'format':'date'},'periodEnd':{'type':['string','null'],'format':'date'},'facts':{'type':['string','null']},'hypothesisStatus':{'enum':['supported','contradicted','insufficient','rejected','not_applicable']},'nextAction':{'type':['string','null']},'note':{'type':['string','null']}}}}
}
schema['required'].append('lifeCompass')
schema['properties']['lifeCompass']={'type':'object',
 'required':['status','visibility'],
 'properties':{
  'status':{'enum':['exploring','provisional','committed','paused']},
  'visibility':{'const':'private'},
  'values':{'type':'array','items':{'type':'string'}},
  'desiredWayOfLiving':{'type':['string','null']},
  'lifePrinciple':{'type':['string','null']},
  'longTermPurpose':{'type':['string','null']},
  'updatedAt':{'type':['string','null'],'format':'date-time'},
  'revisions':{'type':'array','items':{'type':'object','properties':{'changedAt':{'type':'string','format':'date-time'},'reason':{'type':['string','null']},'previousText':{'type':['string','null']}}}}
 }}
schema['$defs']['goal']['properties']['priorityReason']={'type':['string','null']}
schema['$defs']['goal']['properties']['expectedOutcome']={'type':['string','null']}
schema['$defs']['dayPlan']['properties']['priorityReason']={'type':['string','null']}
schema['$defs']['dayPlan']['properties']['displacedActivity']={'type':['string','null']}
(base/'DATA_SCHEMA.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

sample={
'schemaVersion':'2.0','createdAt':'2026-11-07T00:00:00+09:00',
'preferences':{'timeZone':'Asia/Tokyo','dataSharing':'private','lastBackupAt':None,'displayTheme':'dark'},
'profile':{'currentChallenge':'目標設定がまだ難しい','valueDrafts':['人の可能性を引き出したい'], 'motivations':['自分の意思'], 'sharingResistance':'人に話すことへの抵抗','selectedRoute':'protect'},
'workshop':{'status':'completed','startedAt':'2026-11-07T10:00:00+09:00','completedAt':'2026-11-07T11:00:00+09:00','answers':{'Q07':'protect','Q08':'非公開の仮の目標を一つ書く','Q15':'仮の目標を一行書く','Q16':'朝食後に5分'},'selectedRoute':'protect','initialExperimentId':'ex1'},
'goals':[{'id':'g1','status':'provisional','title':'私的な仮目標','purpose':'自分のやりたいことを探索する','targetDate':None,'sharing':'private','createdAt':'2026-11-07T10:20:00+09:00','revisedAt':None,'outcomeMeasureId':None}],
'experiments':[{'id':'ex1','route':'protect','theme':'非公開の仮目標探索','experimentKind':'exploration','firstAction':'仮の目標を1行書く','startCue':'朝食後に机で5分','fallbackPlan':'負担が大きいときは2分だけ','startDate':'2026-11-08','endDate':'2026-11-21','status':'active','hypothesisIds':['self_worth'],'evidenceMeasureIds':['e1']}],
'dayPlans':[{'id':'p1','localDate':'2026-11-08','dayMode':'advance','status':'planned','experimentId':'ex1','importantAction':'仮の目標を1行書く','startCue':'朝食後に机で5分','plannedMinutes':5,'plannedAt':'2026-11-07T11:00:00+09:00','note':None}],
'events':[],
'evidence':[{'id':'e1','layer':'learning','observedAt':'2026-11-07T11:00:00+09:00','description':'目的についての仮説を一つ書く予定','goalId':'g1','experimentId':'ex1','quantity':None,'unit':None,'baselineQuantity':None,'source':'self_report'}],
'reviews':[]}
sample['lifeCompass']={'status':'provisional','visibility':'private','values':['人への貢献'],'desiredWayOfLiving':'人の可能性を引き出す','lifePrinciple':None,'longTermPurpose':None,'updatedAt':'2026-11-07T11:00:00+09:00','revisions':[]}
(base/'SAMPLE_FIXTURE.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Generated',*(p.name for p in base.glob('*.json')), sep='\n- ')
