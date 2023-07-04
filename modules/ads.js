/**
 * @file Модуль рекламы
 * @author wmgcat
 * @version 1.1
*/

const ads = new Module('ads', '1.1');

ERROR.ADS = 5; // код ошибки для рекламы
ERROR.FEEDBACK = 6; // ошибка, которая указывает что нет отзыва

ads.sdk = ''; // SDK
ads.main = false;
ads.auth = false; // авторизация на площадке
ads.ad_timer = timer.create(60); // ограничитель на показ рекламы раз в 5 секунд
ads.ad_timer.reset(999);

/**
 * Загружает файл SDK в игру
 * 
 * @param {string} sdk SDK площадки 
*/
ads.set = async function(sdk) {
  this.sdk = sdk;
  if (sdk) {
    let path = '';
    switch(this.sdk) {
      case 'yandex': path = 'https://yandex.ru/games/sdk/v2'; break;
      case 'vk': path = 'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js'; break;
      case 'crazygames': path = 'https://sdk.crazygames.com/crazygames-sdk-v2.js'; break;
    }

    try {
      await Add.script(path);
      await this.init();
      Add.debug(`${this.sdk} SDK загружен!`);
    }
    catch(err) { return Add.error(err, ERROR.ADS); }
  }
}

/**
 * Инициализация SDK площадки
*/
ads.init = async function() {
  if (!this.sdk) return;

  switch(this.sdk) {
    case 'yandex':
      this.main = await YaGames.init();

      const safeStorage = await this.main.getStorage();
      await Object.defineProperty(window, 'localStorage', {
        get: () => safeStorage
      });

      this.main.features.LoadingAPI.ready();

      // проверка авторизации:
      const player = await this.main.getPlayer();
      this.auth = player.getMode() !== 'lite';
    break;
    case 'vk':
      await vkBridge.send("VKWebAppInit", {});
      ads.main = true;
      ads.auth = true;
    break;
    case 'crazygames':
      ads.main = window.CrazyGames.SDK;
    break;
  }
}

/**
 * Показ полноэкранной рекламы
 * 
 * @return {Promise}
*/
ads.fullscreen = async function() {
  if (!this.main) return;
  if (!this.ad_timer.check()) return;

  if (modules.audio) Eng.focus(false);
  
  const promise = new Promise((res, rej) => {
    switch(this.sdk) {
      case 'yandex':
        this.main.adv.showFullscreenAdv({
          callbacks: {
            onClose: show => res(show),
            onOffline: () => res(true),
            onError: err => rej(err)
          }
        });
      break;
      case 'vk':
        vkBridge.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' }).then(data => {
          if (!data.result) rej('Нет рекламы!');

          vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' }).then(ad => {
            if (ad.result) res(true);
            res(false);
          });
        });
      break;
      case 'crazygames':
        this.main.ad.requestAd('midgame', {
          adError: err => rej(err),
          adFinished: () => res(true)
        });
      break;
    }
  });
  try {
    const state = await promise;
    this.ad_timer.reset();
    if (modules.audio) Eng.focus(true);
    return state;
  }
  catch(err) { return Add.error(err, ERROR.ADS); }
}

/**
 * Показ рекламы за награду
 * 
 * @return {Promise}
*/
ads.reward = async function() {
  if (!this.main) return;

  if (modules.audio) Eng.focus(false);
  
  const promise = new Promise((res, rej) => {
    switch(this.sdk) {
      case 'yandex': {
        let view = false;
        this.main.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => { view = true },
            onClose: () => res(view),
            onError: err => rej(err)
          }
        });
      } break;
      case 'vk':
        vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' }).then(data => {
          if (data.result) res(true);
          else res(false);
        }).catch(err => rej(err));
      break;
      case 'crazygames':
        this.main.ad.requestAd('rewarded', {
          adError: err => rej(err),
          adFinished: () => res(true)
        });
      break;
    }
  });
  try {
    const state = await promise;
    if (modules.audio) Eng.focus(true);
    return state;
  }
  catch(err) { return Add.error(err, ERROR.ADS); }
}

/**
 * Взаимодействие с таблицей рекордов
*/
ads.leaderboard = {
  board: '' // ID таблицы
}

/**
 * Установка таблицы рекордов по умолчанию
 * 
 * @param  {string} id ID таблицы
*/
ads.leaderboard.set = async function(id) {
  this.board = id;
  switch(ads.sdk) {
    case 'yandex':
      ads.main.board = await ads.main.getLeaderboards();
    break;
  }
}

/**
 * Записывает очки в таблицу
 * 
 * @param  {number} score Очки
*/
ads.leaderboard.score = async function(score) {
  if (!ads.main || !ads.main.board) return;

  switch(ads.sdk) {
    case 'yandex':
      await ads.main.board.setLeaderboardScore(this.board, score);
    break;
  }
}

ads.leaderboard.get = async function() {
  if (!ads.main || !ads.main.board) return;

  switch(ads.sdk) {
    case 'yandex':
      try {
        const result = await ads.main.board.getLeaderboardPlayerEntry(this.board);
        return result.score;
      }
      catch(err) {
        if (err.code != 'LEADERBOARD_PLAYER_NOT_PRESENT') return Add.error(err, ERROR.ADS);
        return 0;
      }
    break;
  }
}

/**
 * Оставить отзыв
*/
ads.feedback = async function() {
  if (!this.main) return;

  if (modules.audio) Eng.focus(false);

  const promise = new Promise((res, rej) => {
    switch(this.sdk) {
      case 'yandex':
        this.main.feedback.canReview().then(status => {
          if (!status || !status.value) rej(ERROR.FEEDBACK);

          this.main.feedback.requestReview().then(data => res(data.feedbackSent));
        });
      break;
    }
  });

  try {
    const state = await promise;
    if (modules.audio) Eng.focus(true);
    return state;
  }
  catch(err) {
    if (err != ERROR.FEEDBACK)
      return Add.error(err, ERROR.ADS);
    return err;
  }
}

/**
 * Облачные сохранения
*/
ads.cloud = {};

/**
 * Вытаскивает данные из облака по ключу
 * 
 * @param  {...string} args Ключи сохранения
 * @return {object|bool}
*/
ads.cloud.get = async function(...args) {
  if (!ads.main) return;

  try {
    switch(ads.sdk) {
      case 'yandex': {
        const player = await ads.main.getPlayer(),
              data = await player.getData(args);
        return data;
      } break;
      case 'vk': {
        const result = await vkBridge.send('VKWebAppStorageGet', { keys: args.map(x => x.replaceAll('.', '_')) }),
              data = {};
        for (const elem of result.keys)
          data[elem.key.replaceAll('_', '.')] = elem.value;

        return data;
      } break;
    }
  }
  catch(err) {
    return Add.error(err, ERROR.ADS);
  }
}

/**
 * Записывает данные в облако
 * 
 * @param  {object} data Объект ключ-значение
 * @return {bool}
*/
ads.cloud.set = async function(data) {
  if (!ads.main) return;

  try {
    switch(ads.sdk) {
      case 'yandex': {
        const player = await ads.main.getPlayer(),
              state = await player.setData(data);
        return true;
      } break;
      case 'vk': {
        for (let id of Object.keys(data)) {
          await vkBridge.send('VKWebAppStorageSet', {
            key: id.replaceAll('.', '_'),
            value: data[id] + ''
          });
        }
        return true;
      } break;
    }
  }
  catch(err) {
    Add.error(err, ERROR.ADS);
    return false;
  }
}